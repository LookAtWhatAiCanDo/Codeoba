use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder, PredefinedMenuItem, MenuItemKind, MenuEvent};
use tauri_plugin_opener::OpenerExt;
use crate::commands;

fn translate(lang: &str, key: &str) -> String {
    let json_str = match lang {
        "es" => include_str!("../../src/i18n/locales/es.json"),
        "fr" => include_str!("../../src/i18n/locales/fr.json"),
        "de" => include_str!("../../src/i18n/locales/de.json"),
        "ja" => include_str!("../../src/i18n/locales/ja.json"),
        "zh" => include_str!("../../src/i18n/locales/zh.json"),
        "zh-TW" => include_str!("../../src/i18n/locales/zh-TW.json"),
        "pt" => include_str!("../../src/i18n/locales/pt.json"),
        "it" => include_str!("../../src/i18n/locales/it.json"),
        "ko" => include_str!("../../src/i18n/locales/ko.json"),
        "nl" => include_str!("../../src/i18n/locales/nl.json"),
        "ar" => include_str!("../../src/i18n/locales/ar.json"),
        "ru" => include_str!("../../src/i18n/locales/ru.json"),
        _ => include_str!("../../src/i18n/locales/en.json"),
    };

    let dict: serde_json::Value = serde_json::from_str(json_str).unwrap_or(serde_json::Value::Null);

    let resolved_val = if let Some(val) = get_nested_value(&dict, key) {
        val
    } else if lang != "en" {
        let en_str = include_str!("../../src/i18n/locales/en.json");
        let en_dict: serde_json::Value = serde_json::from_str(en_str).unwrap_or(serde_json::Value::Null);
        if let Some(val) = get_nested_value(&en_dict, key) {
            val
        } else {
            key.to_string()
        }
    } else {
        key.to_string()
    };

    resolved_val
}

fn get_suffix_tabs_and_symbol(lang: &str, key: &str) -> (&'static str, &'static str) {
    match lang {
        "en" => match key {
            "sidebar" => ("\t\t\t\t\t\t", "▶"),
            "detail" => ("\t\t\t\t\t", "◀"),
            "selectHighlighted" => ("\t\t", "␣"),
            "home" => ("\t\t\t\t", "(fn+◀)"),
            "end" => ("\t\t\t\t", "(fn+▶)"),
            "page_up" => ("\t\t\t", "(fn+▲)"),
            "page_down" => ("\t\t", "(fn+▼)"),
            _ => ("", ""),
        },
        "ar" => match key {
            "sidebar" => ("\t\t\t\t\t\t", "▶"),
            "detail" => ("\t\t\t\t\t\t", "◀"),
            "selectHighlighted" => ("\t\t\t", "␣"),
            "home" => ("\t\t\t\t\t", "\u{200E}(fn+▶)\u{200E}"),
            "end" => ("\t\t\t\t\t", "\u{200E}(fn+◀)\u{200E}"),
            "page_up" => ("\t\t\t\t", "\u{200E}(fn+▲)\u{200E}"),
            "page_down" => ("\t\t\t", "\u{200E}(fn+▼)\u{200E}"),
            _ => ("", ""),
        },
        "de" => match key {
            "sidebar" => ("\t\t\t\t\t\t", "▶"),
            "detail" => ("\t\t\t\t\t\t", "◀"),
            "selectHighlighted" => ("\t", "␣"),
            "home" => ("\t\t\t\t", "(fn+◀)"),
            "end" => ("\t\t\t\t\t", "(fn+▶)"),
            "page_up" => ("\t\t\t\t", "(fn+▲)"),
            "page_down" => ("\t\t\t\t", "(fn+▼)"),
            _ => ("", ""),
        },
        "es" => match key {
            "sidebar" => ("\t\t\t\t\t\t\t", "▶"),
            "detail" => ("\t\t\t\t\t\t", "◀"),
            "selectHighlighted" => ("\t\t", "␣"),
            "home" => ("\t\t\t\t\t\t", "(fn+◀)"),
            "end" => ("\t\t\t\t\t\t\t", "(fn+▶)"),
            "page_up" => ("\t\t\t\t\t", "(fn+▲)"),
            "page_down" => ("\t\t\t\t\t", "(fn+▼)"),
            _ => ("", ""),
        },
        "fr" => match key {
            "sidebar" => ("\t\t\t\t\t\t\t\t", "▶"),
            "detail" => ("\t\t\t\t\t\t\t", "◀"),
            "selectHighlighted" => ("\t\t\t\t", "␣"),
            "home" => ("\t\t\t\t\t", "(fn+◀)"),
            "end" => ("\t\t\t\t\t\t", "(fn+▶)"),
            "page_up" => ("\t\t\t", "(fn+▲)"),
            "page_down" => ("\t\t\t\t", "(fn+▼)"),
            _ => ("", ""),
        },
        "it" => match key {
            "sidebar" => ("\t\t\t\t\t", "▶"),
            "detail" => ("\t\t\t\t", "◀"),
            "selectHighlighted" => ("\t\t\t", "␣"),
            "home" => ("\t\t\t\t", "(fn+◀)"),
            "end" => ("\t\t\t\t", "(fn+▶)"),
            "page_up" => ("\t\t\t", "(fn+▲)"),
            "page_down" => ("\t\t\t", "(fn+▼)"),
            _ => ("", ""),
        },
        "ja" => match key {
            "sidebar" => ("\t\t\t\t\t\t", "▶"),
            "detail" => ("\t\t\t\t\t\t", "◀"),
            "selectHighlighted" => ("\t\t", "␣"),
            "home" => ("\t\t\t\t", "(fn+◀)"),
            "end" => ("\t\t\t\t", "(fn+▶)"),
            "page_up" => ("\t\t\t", "(fn+▲)"),
            "page_down" => ("\t\t\t", "(fn+▼)"),
            _ => ("", ""),
        },
        "ko" => match key {
            "sidebar" => ("\t\t\t\t\t\t", "▶"),
            "detail" => ("\t\t\t\t\t\t", "◀"),
            "selectHighlighted" => ("\t", "␣"),
            "home" => ("\t\t\t\t\t", "(fn+◀)"),
            "end" => ("\t\t\t\t\t", "(fn+▶)"),
            "page_up" => ("\t\t\t", "(fn+▲)"),
            "page_down" => ("\t\t\t", "(fn+▼)"),
            _ => ("", ""),
        },
        "nl" => match key {
            "sidebar" => ("\t\t\t\t\t\t\t", "▶"),
            "detail" => ("\t\t\t\t\t\t", "◀"),
            "selectHighlighted" => ("\t\t", "␣"),
            "home" => ("\t\t\t\t\t", "(fn+◀)"),
            "end" => ("\t\t\t\t\t", "(fn+▶)"),
            "page_up" => ("\t\t\t", "(fn+▲)"),
            "page_down" => ("\t\t\t", "(fn+▼)"),
            _ => ("", ""),
        },
        "pt" => match key {
            "sidebar" => ("\t\t\t\t\t\t\t\t", "▶"),
            "detail" => ("\t\t\t\t\t\t\t", "◀"),
            "selectHighlighted" => ("\t\t\t", "␣"),
            "home" => ("\t\t\t\t\t", "(fn+◀)"),
            "end" => ("\t\t\t\t\t\t", "(fn+▶)"),
            "page_up" => ("\t\t\t", "(fn+▲)"),
            "page_down" => ("\t\t\t", "(fn+▼)"),
            _ => ("", ""),
        },
        "ru" => match key {
            "sidebar" => ("\t\t\t\t\t\t\t\t", "▶"),
            "detail" => ("\t\t\t\t\t\t\t\t", "◀"),
            "selectHighlighted" => ("\t\t\t", "␣"),
            "home" => ("\t\t\t\t", "(fn+◀)"),
            "end" => ("\t\t\t\t\t", "(fn+▶)"),
            "page_up" => ("\t\t\t", "(fn+▲)"),
            "page_down" => ("\t\t\t", "(fn+▼)"),
            _ => ("", ""),
        },
        "zh" | "zh-TW" => match key {
            "sidebar" => ("\t\t\t\t\t", "▶"),
            "detail" => ("\t\t\t\t\t", "◀"),
            "selectHighlighted" => ("\t\t\t", "␣"),
            "home" => ("\t\t\t\t", "(fn+◀)"),
            "end" => ("\t\t\t\t", "(fn+▶)"),
            "page_up" => ("\t\t\t", "(fn+▲)"),
            "page_down" => ("\t\t\t", "(fn+▼)"),
            _ => ("", ""),
        },
        _ => ("", ""),
    }
}

fn get_nested_value(dict: &serde_json::Value, key: &str) -> Option<String> {
    let mut current = dict;
    for part in key.split('.') {
        current = current.get(part)?;
    }
    current.as_str().map(|s| s.to_string())
}

#[allow(dead_code)]
pub fn setup_menu(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle();
    let args: Vec<String> = std::env::args().collect();
    let lang = args.iter().position(|r| r == "--lang")
        .and_then(|idx| args.get(idx + 1).cloned())
        .unwrap_or_else(|| {
            let config = crate::keyring::load_fallback_config();
            config.get("language").cloned().unwrap_or_else(|| "en".to_string())
        });
    setup_menu_internal(handle, &lang)
}

pub fn setup_menu_internal<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
    lang: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let t = |key: &str| translate(lang, key);

    // Resolve target server endpoint from config updater settings dynamically
    #[allow(unused_variables)]
    let server_endpoint = commands::get_backend_base_url_internal(app_handle);

    // Find submenu
    let find_menu = SubmenuBuilder::new(app_handle, t("menu.find.title"))
        .item(&MenuItemBuilder::new(t("menu.find.findDetail")).accelerator("CmdOrCtrl+F").id("find-detail").build(app_handle)?)
        .item(&MenuItemBuilder::new(t("menu.find.findSidebar")).accelerator("CmdOrCtrl+Shift+F").id("find-sidebar").build(app_handle)?)
        .build()?;

    // Edit submenu: a standard item that is natively localized by the OS
    let edit_menu = SubmenuBuilder::new(app_handle, "Edit")
        .item(&PredefinedMenuItem::undo(app_handle, None)?)
        .item(&PredefinedMenuItem::redo(app_handle, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app_handle, None)?)
        .item(&PredefinedMenuItem::copy(app_handle, None)?)
        .item(&PredefinedMenuItem::paste(app_handle, None)?)
        .item(&PredefinedMenuItem::select_all(app_handle, None)?)
        .separator()
        .item(&find_menu)
        .build()?;

    // Window submenu: a standard item that is natively localized by the OS
    let window_menu = SubmenuBuilder::new(app_handle, "Window")
        .item(&PredefinedMenuItem::minimize(app_handle, None)?)
        .build()?;

    // File Submenu
    let file_menu_builder = SubmenuBuilder::new(app_handle, t("menu.file.title"))
        .item(&MenuItemBuilder::new(t("menu.file.rebuild")).accelerator("CmdOrCtrl+R").id("rebuild-index").build(app_handle)?)
        .item(&MenuItemBuilder::new(t("menu.file.rebuildBypass")).accelerator("CmdOrCtrl+Shift+R").id("rebuild-index-bypass").build(app_handle)?);
    
    #[cfg(not(target_os = "macos"))]
    let file_menu_builder = file_menu_builder
        .separator()
        .item(&MenuItemBuilder::new(t("menu.file.settings")).accelerator("CmdOrCtrl+,").id("settings").build(app_handle)?)
        .separator()
        .item(&PredefinedMenuItem::quit(app_handle, None)?);

    let file_menu = file_menu_builder.build()?;

    // View Submenu
    let view_menu = SubmenuBuilder::new(app_handle, t("menu.view.title"))
        .item(&PredefinedMenuItem::fullscreen(app_handle, None)?)
        .build()?;

    // Go Submenu
    let highlight_modifier = if cfg!(target_os = "macos") { "Shift+Ctrl" } else { "Ctrl" };
    let mod_string = match highlight_modifier.as_ref() {
        "Shift+Ctrl" => "Shift+Ctrl+",
        "Shift+Alt" => "Shift+Alt+",
        "Ctrl" => "Ctrl+",
        _ => "Shift+Ctrl+",
    };

    let prefix = if lang == "ar" { "\u{200E}" } else { "" };

    let sidebar_label = if cfg!(target_os = "macos") {
        let (tabs, sym) = get_suffix_tabs_and_symbol(lang, "sidebar");
        format!("{}{}{}{}", prefix, t("menu.go.sidebar"), tabs, sym)
    } else {
        t("menu.go.sidebar")
    };

    let detail_label = if cfg!(target_os = "macos") {
        let (tabs, sym) = get_suffix_tabs_and_symbol(lang, "detail");
        format!("{}{}{}{}", prefix, t("menu.go.detail"), tabs, sym)
    } else {
        t("menu.go.detail")
    };

    let select_highlighted_label = if cfg!(target_os = "macos") {
        let (tabs, sym) = get_suffix_tabs_and_symbol(lang, "selectHighlighted");
        format!("{}{}{}{}", prefix, t("menu.go.selectHighlighted"), tabs, sym)
    } else {
        t("menu.go.selectHighlighted")
    };

    let go_menu = SubmenuBuilder::new(app_handle, t("menu.go.title"))
        .item(&MenuItemBuilder::new(t("menu.go.back")).accelerator("CmdOrCtrl+[").id("nav-back").build(app_handle)?)
        .item(&MenuItemBuilder::new(t("menu.go.forward")).accelerator("CmdOrCtrl+]").id("nav-forward").build(app_handle)?)
        .separator()
        .item(&MenuItemBuilder::new(t("menu.go.dashboard")).accelerator("CmdOrCtrl+0").id("go-home").build(app_handle)?)
        .item(&MenuItemBuilder::new(sidebar_label).accelerator("CmdOrCtrl+1").id("focus-sidebar").build(app_handle)?)
        .item(&MenuItemBuilder::new(detail_label).accelerator("CmdOrCtrl+2").id("focus-detail").build(app_handle)?)
        .separator()
        .item(&MenuItemBuilder::new(t("menu.go.nextSession")).id("go-next-session").accelerator("Down").build(app_handle)?)
        .item(&MenuItemBuilder::new(t("menu.go.prevSession")).id("go-prev-session").accelerator("Up").build(app_handle)?)
        .item(&MenuItemBuilder::new(t("menu.go.highlightNext")).id("go-highlight-next").accelerator(format!("{}Down", mod_string)).build(app_handle)?)
        .item(&MenuItemBuilder::new(t("menu.go.highlightPrev")).id("go-highlight-prev").accelerator(format!("{}Up", mod_string)).build(app_handle)?)
        .item(&MenuItemBuilder::new(select_highlighted_label).id("go-select-highlighted").accelerator("Enter").build(app_handle)?)
        .separator();

    let dashboard_text = t("menu.go.dashboard");
    let sep = if lang == "ar" { "\u{200E}: \u{200E}" } else { ": " };
    
    let (home_tabs, home_sym) = get_suffix_tabs_and_symbol(lang, "home");
    let (end_tabs, end_sym) = get_suffix_tabs_and_symbol(lang, "end");
    let (pu_tabs, pu_sym) = get_suffix_tabs_and_symbol(lang, "page_up");
    let (pd_tabs, pd_sym) = get_suffix_tabs_and_symbol(lang, "page_down");

    let scroll_top_text = if cfg!(target_os = "macos") {
        format!("{}{}{}{}{}{}", prefix, dashboard_text, sep, t("menu.go.home"), home_tabs, home_sym)
    } else {
        format!("{}{}{}{}", prefix, dashboard_text, sep, t("menu.go.home"))
    };
 
    let scroll_bottom_text = if cfg!(target_os = "macos") {
        format!("{}{}{}{}{}{}", prefix, dashboard_text, sep, t("menu.go.end"), end_tabs, end_sym)
    } else {
        format!("{}{}{}{}", prefix, dashboard_text, sep, t("menu.go.end"))
    };
 
    let scroll_page_up_text = if cfg!(target_os = "macos") {
        format!("{}{}{}{}{}{}", prefix, dashboard_text, sep, t("menu.go.pageUp"), pu_tabs, pu_sym)
    } else {
        format!("{}{}{}{}", prefix, dashboard_text, sep, t("menu.go.pageUp"))
    };
 
    let scroll_page_down_text = if cfg!(target_os = "macos") {
        format!("{}{}{}{}{}{}", prefix, dashboard_text, sep, t("menu.go.pageDown"), pd_tabs, pd_sym)
    } else {
        format!("{}{}{}{}", prefix, dashboard_text, sep, t("menu.go.pageDown"))
    };

    let go_menu = go_menu
        // Dynamically updated in update_scroll_menu_labels
        .item(&MenuItemBuilder::new(scroll_top_text).id("scroll-top").accelerator("Home").build(app_handle)?)
        .item(&MenuItemBuilder::new(scroll_bottom_text).id("scroll-bottom").accelerator("End").build(app_handle)?)
        .item(&MenuItemBuilder::new(scroll_page_up_text).id("scroll-page-up").accelerator("PageUp").build(app_handle)?)
        .item(&MenuItemBuilder::new(scroll_page_down_text).id("scroll-page-down").accelerator("PageDown").build(app_handle)?)
        .build()?;

    // Help Submenu
    #[cfg(any(not(dev), feature = "enable-help-menu"))]
    let help_menu = {
        #[allow(unused_mut)]
        let mut help_menu_builder = SubmenuBuilder::new(app_handle, t("menu.help.title"))
            .item(&MenuItemBuilder::new(server_endpoint.clone()).id("help-website").build(app_handle)?);

        help_menu_builder = help_menu_builder
            .item(&MenuItemBuilder::new(t("menu.help.feedback")).id("help-feedback").build(app_handle)?);

        #[cfg(not(target_os = "macos"))]
        {
            if commands::is_updater_active(app_handle.clone()) {
                help_menu_builder = help_menu_builder
                    .separator()
                    .item(&MenuItemBuilder::new(t("settings.updates.checkUpdate")).id("check-updates").build(app_handle)?);
            }
            help_menu_builder = help_menu_builder
                .separator()
                .item(&PredefinedMenuItem::about(app_handle, None, None)?);
        }
        help_menu_builder.build()?
    };

    // Main Menu
    // Suppress `variable does not need to be mutable` warning in non-macos builds
    #[allow(unused_mut)]
    let mut menu_builder = MenuBuilder::new(app_handle);
    
    #[cfg(target_os = "macos")]
    {
        let mut app_menu_builder = SubmenuBuilder::new(app_handle, "Codeoba")
            .item(&PredefinedMenuItem::about(app_handle, None, None)?);
            
        if commands::is_updater_active(app_handle.clone()) {
            app_menu_builder = app_menu_builder.item(&MenuItemBuilder::new(t("settings.updates.checkUpdate")).id("check-updates").build(app_handle)?);
        }

        let app_menu = app_menu_builder
            .separator()
            .item(&MenuItemBuilder::new(t("menu.file.preferences")).accelerator("CmdOrCtrl+,").id("settings").build(app_handle)?)
            .separator()
            .item(&PredefinedMenuItem::services(app_handle, None)?)
            .separator()
            .item(&PredefinedMenuItem::hide(app_handle, None)?)
            .item(&PredefinedMenuItem::hide_others(app_handle, None)?)
            .item(&PredefinedMenuItem::show_all(app_handle, None)?)
            .separator()
            .item(&PredefinedMenuItem::quit(app_handle, None)?)
            .build()?;
            
        menu_builder = menu_builder.item(&app_menu);
    }

    #[allow(unused_mut)]
    let mut menu_builder = menu_builder
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&go_menu)
        .item(&window_menu);

    #[cfg(any(not(dev), feature = "enable-help-menu"))]
    {
        menu_builder = menu_builder.item(&help_menu);
    }

    let menu = menu_builder.build()?;

    app_handle.set_menu(menu)?;

    // Only set as the official macOS Help menu in production/release builds.
    // In local debug/development builds, we bypass this to avoid macOS's preflight event swallowing.
    #[cfg(all(target_os = "macos", any(not(dev), feature = "enable-help-menu")))]
    help_menu.set_as_help_menu_for_nsapp()?;

    Ok(())
}

#[tauri::command]
pub async fn update_scroll_menu_labels<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
    pane_name: String,
) -> Result<(), String> {
    
    // Recursive search helper to find a menu item by ID
    fn find_item_by_id<R: tauri::Runtime>(items: &[MenuItemKind<R>], id: &str) -> Option<MenuItemKind<R>> {
        for item in items {
            let item_id = match item {
                MenuItemKind::MenuItem(i) => i.id().as_ref().to_string(),
                MenuItemKind::Submenu(s) => s.id().as_ref().to_string(),
                MenuItemKind::Predefined(p) => p.id().as_ref().to_string(),
                MenuItemKind::Check(c) => c.id().as_ref().to_string(),
                MenuItemKind::Icon(i) => i.id().as_ref().to_string(),
            };
            if item_id == id {
                return Some(item.clone());
            }
            if let MenuItemKind::Submenu(submenu) = item {
                if let Ok(sub_items) = submenu.items() {
                    if let Some(found) = find_item_by_id(&sub_items, id) {
                        return Some(found);
                    }
                }
            }
        }
        None
    }

    let menu = match app_handle.menu() {
        Some(m) => m,
        None => return Ok(()),
    };

    let items = match menu.items() {
        Ok(it) => it,
        Err(_) => return Ok(()),
    };

    // Load active language
    let args: Vec<String> = std::env::args().collect();
    let lang_str = args.iter().position(|r| r == "--lang")
        .and_then(|idx| args.get(idx + 1).cloned())
        .unwrap_or_else(|| {
            let config = crate::keyring::load_fallback_config();
            config.get("language").cloned().unwrap_or_else(|| "en".to_string())
        });
    let lang = &lang_str;
    let t = |key: &str| translate(lang, key);

    // Map incoming pane_name (Sidebar, Detail Pane, Dashboard) to translated keys
    let localized_pane_name = match pane_name.as_str() {
        "Sidebar" => t("menu.go.sidebar"),
        "Detail Pane" => t("menu.go.detail"),
        "Dashboard" => t("menu.go.dashboard"),
        _ => pane_name,
    };

    let sep = if lang == "ar" { "\u{200E}: \u{200E}" } else { ": " };
    let prefix = if lang == "ar" { "\u{200E}" } else { "" };

    let (home_tabs, home_sym) = get_suffix_tabs_and_symbol(lang, "home");
    let (end_tabs, end_sym) = get_suffix_tabs_and_symbol(lang, "end");
    let (pu_tabs, pu_sym) = get_suffix_tabs_and_symbol(lang, "page_up");
    let (pd_tabs, pd_sym) = get_suffix_tabs_and_symbol(lang, "page_down");

    // 1. scroll-top
    if let Some(MenuItemKind::MenuItem(item)) = find_item_by_id(&items, "scroll-top") {
        let text = if cfg!(target_os = "macos") {
            format!("{}{}{}{}{}{}", prefix, localized_pane_name, sep, t("menu.go.home"), home_tabs, home_sym)
        } else {
            format!("{}{}{}{}", prefix, localized_pane_name, sep, t("menu.go.home"))
        };
        let _ = item.set_text(text);
    }
 
    // 2. scroll-bottom
    if let Some(MenuItemKind::MenuItem(item)) = find_item_by_id(&items, "scroll-bottom") {
        let text = if cfg!(target_os = "macos") {
            format!("{}{}{}{}{}{}", prefix, localized_pane_name, sep, t("menu.go.end"), end_tabs, end_sym)
        } else {
            format!("{}{}{}{}", prefix, localized_pane_name, sep, t("menu.go.end"))
        };
        let _ = item.set_text(text);
    }
 
    // 3. scroll-page-up
    if let Some(MenuItemKind::MenuItem(item)) = find_item_by_id(&items, "scroll-page-up") {
        let text = if cfg!(target_os = "macos") {
            format!("{}{}{}{}{}{}", prefix, localized_pane_name, sep, t("menu.go.pageUp"), pu_tabs, pu_sym)
        } else {
            format!("{}{}{}{}", prefix, localized_pane_name, sep, t("menu.go.pageUp"))
        };
        let _ = item.set_text(text);
    }
 
    // 4. scroll-page-down
    if let Some(MenuItemKind::MenuItem(item)) = find_item_by_id(&items, "scroll-page-down") {
        let text = if cfg!(target_os = "macos") {
            format!("{}{}{}{}{}{}", prefix, localized_pane_name, sep, t("menu.go.pageDown"), pd_tabs, pd_sym)
        } else {
            format!("{}{}{}{}", prefix, localized_pane_name, sep, t("menu.go.pageDown"))
        };
        let _ = item.set_text(text);
    }

    Ok(())
}

#[tauri::command]
pub async fn set_menu_item_text<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
    id: String,
    text: String,
) -> Result<(), String> {
    // Recursive search helper to find a menu item by ID
    fn find_item_by_id<R: tauri::Runtime>(items: &[MenuItemKind<R>], id: &str) -> Option<MenuItemKind<R>> {
        for item in items {
            let item_id = match item {
                MenuItemKind::MenuItem(i) => i.id().as_ref().to_string(),
                MenuItemKind::Submenu(s) => s.id().as_ref().to_string(),
                MenuItemKind::Predefined(p) => p.id().as_ref().to_string(),
                MenuItemKind::Check(c) => c.id().as_ref().to_string(),
                MenuItemKind::Icon(i) => i.id().as_ref().to_string(),
            };
            if item_id == id {
                return Some(item.clone());
            }
            if let MenuItemKind::Submenu(submenu) = item {
                if let Ok(sub_items) = submenu.items() {
                    if let Some(found) = find_item_by_id(&sub_items, id) {
                        return Some(found);
                    }
                }
            }
        }
        None
    }

    let menu = match app_handle.menu() {
        Some(m) => m,
        None => return Ok(()),
    };

    let items = match menu.items() {
        Ok(it) => it,
        Err(_) => return Ok(()),
    };

    if let Some(MenuItemKind::MenuItem(item)) = find_item_by_id(&items, &id) {
        let _ = item.set_text(text);
    }

    Ok(())
}

pub fn handle_menu_event<R: tauri::Runtime>(app_handle: &tauri::AppHandle<R>, event: MenuEvent) {
    use tauri::Emitter;
    let id = event.id().as_ref();
    println!("[Rust] Menu event triggered on builder: {}", id);

    // Helper to emit globally
    let emit_event = |event_name: &str| {
        println!("[Rust] Emitting globally: {}", event_name);
        let _ = app_handle.emit(event_name, ());
    };

    match id {
        "settings" => emit_event("menu-settings"),
        "check-updates" => emit_event("menu-check-updates"),
        "rebuild-index" => emit_event("menu-rebuild-index"),
        "rebuild-index-bypass" => emit_event("menu-rebuild-index-bypass"),
        "find-detail" => emit_event("menu-find-detail"),
        "find-sidebar" => emit_event("menu-find-sidebar"),
        "go-home" => emit_event("menu-go-home"),
        "nav-back" => emit_event("menu-nav-back"),
        "nav-forward" => emit_event("menu-nav-forward"),
        "focus-sidebar" => emit_event("menu-focus-sidebar"),
        "focus-detail" => emit_event("menu-focus-detail"),
        "go-next-session" => emit_event("menu-go-next-session"),
        "go-prev-session" => emit_event("menu-go-prev-session"),
        "go-highlight-next" => emit_event("menu-go-highlight-next"),
        "go-highlight-prev" => emit_event("menu-go-highlight-prev"),
        "go-select-highlighted" => emit_event("menu-go-select-highlighted"),
        "scroll-top" => emit_event("menu-scroll-top"),
        "scroll-bottom" => emit_event("menu-scroll-bottom"),
        "scroll-page-up" => emit_event("menu-scroll-page-up"),
        "scroll-page-down" => emit_event("menu-scroll-page-down"),
        "sidebar-scroll-top" => emit_event("menu-sidebar-scroll-top"),
        "sidebar-scroll-bottom" => emit_event("menu-sidebar-scroll-bottom"),
        "sidebar-scroll-page-up" => emit_event("menu-sidebar-scroll-page-up"),
        "sidebar-scroll-page-down" => emit_event("menu-sidebar-scroll-page-down"),
        "help-website" => {
            let endpoint = commands::get_backend_base_url_internal(app_handle);
            let _ = app_handle.opener().open_url(&endpoint, None::<String>);
        }
        "help-feedback-apple" => {
            let _ = app_handle.opener().open_url("applefeedback://new", None::<String>);
        }
        id if id.contains("feedback") => emit_event("menu-feedback"),
        _ => {}
    }
}
