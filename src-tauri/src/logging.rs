#[macro_export]
macro_rules! log_info {
    ($($arg:tt)*) => {{
        let now = chrono::Local::now();
        println!("[{}] {}", now.format("%Y-%m-%d %H:%M:%S%.3f"), format!($($arg)*));
    }};
}

#[macro_export]
macro_rules! log_warn {
    ($($arg:tt)*) => {{
        let now = chrono::Local::now();
        eprintln!("[{}] Warning: {}", now.format("%Y-%m-%d %H:%M:%S%.3f"), format!($($arg)*));
    }};
}

#[macro_export]
macro_rules! log_error {
    ($($arg:tt)*) => {{
        let now = chrono::Local::now();
        eprintln!("[{}] Error: {}", now.format("%Y-%m-%d %H:%M:%S%.3f"), format!($($arg)*));
    }};
}

#[macro_export]
macro_rules! log_debug {
    ($($arg:tt)*) => {{
        #[cfg(debug_assertions)]
        {
            let now = chrono::Local::now();
            println!("[{}] [DEBUG] {}", now.format("%Y-%m-%d %H:%M:%S%.3f"), format!($($arg)*));
        }
    }};
}

#[macro_export]
macro_rules! log_trace {
    ($($arg:tt)*) => {{
        #[cfg(debug_assertions)]
        {
            let now = chrono::Local::now();
            println!("[{}] [TRACE] {}", now.format("%Y-%m-%d %H:%M:%S%.3f"), format!($($arg)*));
        }
    }};
}
