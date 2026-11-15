//! Finite trusted literature child. Core owns its process and all data effects.
mod host;

use std::{io, process::ExitCode};

fn main() -> ExitCode {
    match host::run(&mut io::stdin().lock(), &mut io::stdout().lock()) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::from(2)
        }
    }
}
