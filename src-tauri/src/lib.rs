// 后端只负责提供 HTTP（绕过 WebView 的 CORS 限制并支持流式）和打开外部链接。
// 所有聊天逻辑都在 ../src 的前端里。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running honeGPT");
}
