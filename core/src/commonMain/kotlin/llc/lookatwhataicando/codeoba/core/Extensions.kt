package llc.lookatwhataicando.codeoba.core

import androidx.compose.runtime.Stable
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.scale
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import llc.lookatwhataicando.codeoba.core.domain.Logger

@Suppress("UnnecessaryComposedModifier")
@Stable
fun Modifier.mirror(): Modifier = composed {
    if (LocalLayoutDirection.current == LayoutDirection.Rtl) {
        this.scale(scaleX = -1f, scaleY = 1f)
    } else {
        this
    }
}

/**
 * Extension function to provide a simpler logging interface.
 */
fun Logger.log(tag: String, message: String) {
    i(tag, message)
}
