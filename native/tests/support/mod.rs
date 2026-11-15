use research_literature_library_native::retrieval_trace::hash;
use research_workbench_native_sdk::{
    literature_trace_protocol::{
        self as protocol, Request, RequestBody, Response, SnapshotInput, SnapshotRef,
    },
    retrieval_trace::RetrievalTraceRow,
};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::Path,
    process::{Command, Output, Stdio},
};

pub fn request(body: RequestBody) -> Request {
    Request {
        protocol_version: protocol::PROTOCOL_VERSION,
        plugin_id: protocol::PLUGIN_ID.into(),
        package_key: "a".repeat(64),
        instance_id: "8cbfd428-3ac1-4bce-b4f6-d41f31063d8e".into(),
        request_id: uuid::Uuid::new_v4().to_string(),
        body,
    }
}

pub fn row() -> RetrievalTraceRow {
    RetrievalTraceRow {
        paper_id: None,
        query_sha256: hash("原问题"),
        status: "previewed".into(),
        context_text: "  [CN-S1] 原文\n\0原字节  ".into(),
        context_sha256: hash("  [CN-S1] 原文\n\0原字节  "),
        expired: false,
    }
}

pub fn snapshot(directory: &Path, input: &SnapshotInput) -> Request {
    use std::os::unix::fs::PermissionsExt;
    let mut request = request(RequestBody::Initialize);
    let bytes = serde_json::to_vec(input).unwrap();
    let reference = SnapshotRef::for_request(
        &request,
        bytes.len() as u64,
        format!("{:x}", Sha256::digest(&bytes)),
    );
    let path = directory.join(&reference.relative_handle);
    fs::write(&path, &bytes).unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o400)).unwrap();
    request.body = RequestBody::DecideNoteTrace {
        snapshot: reference,
    };
    request
}

pub fn execute(directory: &Path, bytes: &[u8]) -> Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_literature-library-host"))
        .current_dir(directory)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child.stdin.take().unwrap().write_all(bytes).unwrap();
    child.wait_with_output().unwrap()
}

pub fn execute_requests(directory: &Path, requests: &[Request]) -> Output {
    let bytes = requests
        .iter()
        .flat_map(|request| protocol::encode_request(request).unwrap())
        .collect::<Vec<_>>();
    execute(directory, &bytes)
}

pub fn session(decide: Request) -> Vec<Request> {
    vec![
        request(RequestBody::Initialize),
        decide,
        request(RequestBody::Shutdown),
    ]
}

pub fn responses(output: &Output, requests: &[Request]) -> Vec<Response> {
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(output.stderr.is_empty());
    let lines = output
        .stdout
        .split(|byte| *byte == b'\n')
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>();
    assert_eq!(lines.len(), requests.len());
    lines
        .iter()
        .zip(requests)
        .map(|(line, request)| {
            let response = protocol::decode_response(line).unwrap();
            response.validate_for_request(request).unwrap();
            response
        })
        .collect()
}
