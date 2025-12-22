package llc.lookatwhataicando.codeoba.core.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Agent tab content displaying the GitHub Copilot Agents page in a browser.
 * Provides easy navigation with gestures support.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AgentTabContent(modifier: Modifier = Modifier) {
    Column(modifier = modifier.fillMaxSize()) {
        // Header
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = MaterialTheme.colorScheme.surfaceVariant,
            tonalElevation = 2.dp
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "GitHub Copilot Agents",
                    style = MaterialTheme.typography.titleMedium
                )
            }
        }
        
        // WebView content
        WebView(
            url = "https://github.com/copilot/agents",
            modifier = Modifier.fillMaxSize()
        )
    }
}
