
# OpenAI Realtime API

I have a working very large/complicated Kotlin module for the entire OpenAI API at:
* https://github.com/swooby/openai-openapi-kotlin/tree/main/lib/src/main/kotlin/com/openai
  * https://github.com/swooby/openai-openapi-kotlin/blob/main/lib/src/main/kotlin/com/openai/apis/RealtimeApi.kt
  * https://github.com/swooby/openai-openapi-kotlin/tree/main/lib/src/main/kotlin/com/openai/models`/Realtime*.kt`

That version is for the 2025/02/12 OpenAI API and is quite a bit of work to update to the latest API.
(Yes, I could probably try to get an AI to do that!)

The problem with that is that it uses https://github.com/openai/openai-openapi/blob/master/openapi.yaml,
which proves itself as a cluster fuck because that file no longer exists and is replaced with a readme that
says to use:
* https://app.stainless.com/api/spec/documented/openai/openapi.documented.yml  
  The problem with this is that OpenAI pays stainless.com a huge amount of money to do a shitty job keeping that file not up to date.  
  -or-
* https://github.com/openai/openai-openapi/tree/manual_spec  
  The problem with this is that it was last updated 8 months ago!!!!

I know this because I tried to use them and they were never up to date 6+ months ago,
and they are still not up to date and still hard to work with.  
There is no reason why it should be this difficult for them to maintain,
but for some reason it is for them...  
...so I am going to try a different hopefully more direct approach.

As much as I often find the https://platform.openai.com/docs/api-reference/realtime documentation
out of date, and some things undocumented (ex: for many months
https://platform.openai.com/docs/api-reference/realtime-server-events/output_audio_buffer/started
and https://platform.openai.com/docs/api-reference/realtime-server-events/output_audio_buffer/stopped
were never documented) it still seems like the best available
source of truth of the API.

Why not semi-automate scraping https://platform.openai.com/docs/api-reference/realtime and generate
the Kotlin code needed to work with the API?

The problem with that is their shitty web UI!

They drop you into the page with all of the meat collapsed behind
`button.param-expand-button[aria-expanded="false"]` elements!  
You cannot just Control/Command-A to select all!  
You have to click each and every one of the `button.param-expand-button[aria-expanded="false"]`
elements in order to expand them and see the whole API.

So I semi-automate this.

Prompt:
```
Find all nested button.param-expand-button elements within the selected element ($0) that have aria-expanded="false" and then simulate a click on each of them.
Repeat that until there are no more child node `button.param-expand-button` elements that have `aria-expanded="false"`.
```
Response:
```
async function clickButtons() {
  let buttonsClicked = true;
  while (buttonsClicked) {
    buttonsClicked = false;
    const buttons = $0.querySelectorAll('button.param-expand-button[aria-expanded="false"]');
    if (buttons.length > 0) {
      buttons.forEach(button => {
        button.click();
        buttonsClicked = true;
      });
      // Small delay to allow the DOM to update after clicks
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
}

clickButtons();
```

## How To Use
1. Browse to the API you want to convert to Kotlin.  
  Example:  
  https://platform.openai.com/docs/api-reference/realtime-client-events/conversation/item/create
2. Right-Click and `Inspect`
3. Right-Click on the parent `div.section` element and `Debug with AI`->`Start a chat`
4. Prompt:
````
Run the following code:
```
async function clickButtons() {
  let buttonsClicked = true;
  while (buttonsClicked) {
    buttonsClicked = false;
    const buttons = $0.querySelectorAll('button.param-expand-button[aria-expanded="false"]');
    if (buttons.length > 0) {
      buttons.forEach(button => {
        button.click();
        buttonsClicked = true;
      });
      // Small delay to allow the DOM to update after clicks
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
}

clickButtons();
```
````
5. Manually select the text in the browser and copy it to clipboard.  
  Example:
```
event_id
string

Optional client-generated ID used to identify this event.

item
object

A single item within a Realtime conversation.

Hide possible types
...

previous_item_id
string

The ID of the preceding item after which the new item will be inserted. If not set, the new item will be appended to the end of the conversation. If set to root, the new item will be added to the beginning of the conversation. If set to an existing ID, it allows an item to be inserted mid-conversation. If the ID cannot be found, an error will be returned and the item will not be added.

type
string

The event type, must be conversation.item.create.
```
6. Open an AI prompt and enter:
````
Write a kotlin function that generates a json object of the following protocol item
```
{paste your clipboard text here}
```
````
7. Example response:
````
Below is a Kotlin implementation that builds the JSON object for a `conversation.item.create` event, supporting all of the item variants you listed, using `kotlinx-serialization`’s `JsonObject`/`buildJsonObject`.

```kotlin
@file:Suppress("unused")

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/**
 * Builds a Realtime "conversation.item.create" event payload:
 *
 * {
 *   "type": "conversation.item.create",
 *   "event_id": "...",          // optional
 *   "item": { ... }             // required
 * }
 */
fun buildConversationItemCreateEventJson(
  item: JsonObject,
  eventId: String? = null
): JsonObject = buildJsonObject {
  put("type", "conversation.item.create")
  if (!eventId.isNullOrBlank()) put("event_id", eventId)
  put("item", item)
}

/* ----------------------------- Item builders ----------------------------- */

fun buildSystemMessageItem(
  text: String,
  id: String? = null,
  status: String? = null,
  includeObjectField: Boolean = false
): JsonObject = buildJsonObject {
  put("type", "message")
  put("role", "system")
  if (!id.isNullOrBlank()) put("id", id)
  if (includeObjectField) put("object", "realtime.item")
  if (!status.isNullOrBlank()) put("status", status)

  put("content", buildJsonArray {
    add(buildJsonObject {
      put("type", "input_text")
      put("text", text)
    })
  })
}

fun buildUserTextMessageItem(
  text: String,
  id: String? = null,
  status: String? = null,
  includeObjectField: Boolean = false
): JsonObject = buildJsonObject {
  put("type", "message")
  put("role", "user")
  if (!id.isNullOrBlank()) put("id", id)
  if (includeObjectField) put("object", "realtime.item")
  if (!status.isNullOrBlank()) put("status", status)

  put("content", buildJsonArray {
    add(buildJsonObject {
      put("type", "input_text")
      put("text", text)
    })
  })
}

fun buildUserAudioMessageItem(
  base64Audio: String,
  transcript: String? = null,
  id: String? = null,
  status: String? = null,
  includeObjectField: Boolean = false
): JsonObject = buildJsonObject {
  put("type", "message")
  put("role", "user")
  if (!id.isNullOrBlank()) put("id", id)
  if (includeObjectField) put("object", "realtime.item")
  if (!status.isNullOrBlank()) put("status", status)

  put("content", buildJsonArray {
    add(buildJsonObject {
      put("type", "input_audio")
      put("audio", base64Audio)
      if (!transcript.isNullOrBlank()) put("transcript", transcript)
    })
  })
}

fun buildUserImageMessageItem(
  dataUri: String,              // e.g. "data:image/png;base64,...."
  detail: String? = null,        // e.g. "auto" or "high"
  id: String? = null,
  status: String? = null,
  includeObjectField: Boolean = false
): JsonObject = buildJsonObject {
  put("type", "message")
  put("role", "user")
  if (!id.isNullOrBlank()) put("id", id)
  if (includeObjectField) put("object", "realtime.item")
  if (!status.isNullOrBlank()) put("status", status)

  put("content", buildJsonArray {
    add(buildJsonObject {
      put("type", "input_image")
      put("image_url", dataUri)
      if (!detail.isNullOrBlank()) put("detail", detail)
    })
  })
}

fun buildAssistantTextMessageItem(
  text: String,
  id: String? = null,
  status: String? = null,
  includeObjectField: Boolean = false
): JsonObject = buildJsonObject {
  put("type", "message")
  put("role", "assistant")
  if (!id.isNullOrBlank()) put("id", id)
  if (includeObjectField) put("object", "realtime.item")
  if (!status.isNullOrBlank()) put("status", status)

  put("content", buildJsonArray {
    add(buildJsonObject {
      put("type", "output_text")
      put("text", text)
    })
  })
}

fun buildAssistantAudioMessageItem(
  base64Audio: String,
  transcript: String? = null,
  id: String? = null,
  status: String? = null,
  includeObjectField: Boolean = false
): JsonObject = buildJsonObject {
  put("type", "message")
  put("role", "assistant")
  if (!id.isNullOrBlank()) put("id", id)
  if (includeObjectField) put("object", "realtime.item")
  if (!status.isNullOrBlank()) put("status", status)

  put("content", buildJsonArray {
    add(buildJsonObject {
      put("type", "output_audio")
      put("audio", base64Audio)
      if (!transcript.isNullOrBlank()) put("transcript", transcript)
    })
  })
}

fun buildFunctionCallItem(
  name: String,
  callId: String,
  argumentsJsonString: String,   // JSON-encoded string, e.g. {"arg1":"v", "arg2":42}
  id: String? = null,
  status: String? = null,
  includeObjectField: Boolean = false
): JsonObject = buildJsonObject {
  put("type", "function_call")
  put("name", name)
  put("call_id", callId)
  put("arguments", argumentsJsonString)
  if (!id.isNullOrBlank()) put("id", id)
  if (includeObjectField) put("object", "realtime.item")
  if (!status.isNullOrBlank()) put("status", status)
}

fun buildFunctionCallOutputItem(
  callId: String,
  output: String,
  id: String? = null,
  status: String? = null,
  includeObjectField: Boolean = false
): JsonObject = buildJsonObject {
  put("type", "function_call_output")
  put("call_id", callId)
  put("output", output)
  if (!id.isNullOrBlank()) put("id", id)
  if (includeObjectField) put("object", "realtime.item")
  if (!status.isNullOrBlank()) put("status", status)
}

fun buildMcpApprovalResponseItem(
  approvalRequestId: String,
  approve: Boolean,
  reason: String? = null,
  id: String? = null
): JsonObject = buildJsonObject {
  put("type", "mcp_approval_response")
  put("approval_request_id", approvalRequestId)
  put("approve", approve)
  if (!reason.isNullOrBlank()) put("reason", reason)
  if (!id.isNullOrBlank()) put("id", id)
}

fun buildMcpListToolsItem(
  serverLabel: String,
  tools: List<McpToolDescriptor>,
  id: String? = null
): JsonObject = buildJsonObject {
  put("type", "mcp_list_tools")
  put("server_label", serverLabel)
  if (!id.isNullOrBlank()) put("id", id)

  put("tools", buildJsonArray {
    tools.forEach { tool ->
      add(buildJsonObject {
        put("name", tool.name)
        if (!tool.description.isNullOrBlank()) put("description", tool.description)
        if (tool.annotations != null) put("annotations", tool.annotations)
        put("input_schema", tool.inputSchema)
      })
    }
  })
}

data class McpToolDescriptor(
  val name: String,
  val description: String? = null,
  val annotations: JsonObject? = null,
  val inputSchema: JsonObject
)

fun buildMcpToolCallItem(
  serverLabel: String,
  name: String,
  argumentsJsonString: String,
  output: String? = null,
  approvalRequestId: String? = null,
  error: JsonObject? = null,
  id: String? = null
): JsonObject = buildJsonObject {
  put("type", "mcp_call")
  put("server_label", serverLabel)
  put("name", name)
  put("arguments", argumentsJsonString)
  if (!approvalRequestId.isNullOrBlank()) put("approval_request_id", approvalRequestId)
  if (error != null) put("error", error)
  if (!output.isNullOrBlank()) put("output", output)
  if (!id.isNullOrBlank()) put("id", id)
}

fun buildMcpApprovalRequestItem(
  serverLabel: String,
  name: String,
  argumentsJsonString: String,
  previousItemId: String? = null,
  id: String? = null
): JsonObject = buildJsonObject {
  put("type", "mcp_approval_request")
  put("server_label", serverLabel)
  put("name", name)
  put("arguments", argumentsJsonString)
  if (!previousItemId.isNullOrBlank()) put("previous_item_id", previousItemId)
  if (!id.isNullOrBlank()) put("id", id)
}

/* ----------------------------- Example usage ----------------------------- */

fun example(): JsonObject {
  val item = buildUserTextMessageItem(text = "Hello from the client", id = "msg_123")
  return buildConversationItemCreateEventJson(item = item, eventId = "evt_abc")
}
```

If you want, I can refactor this into a sealed-class model and a single `toJson()` so you get compile-time exhaustiveness (rather than “stringly typed” builders).

````
8. Optionally go down the rabbit hole of refactoring that into a sealed-class model. (I did)


For now I am OK doing this manually for individual elements that I need.

One day I might have AI generate a Chrome Extension that can do this? :)
