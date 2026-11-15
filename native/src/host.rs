//! Stdio adapter only; no process owner, SQL, clock or shared Core mutation.
mod snapshot;

use research_agent_api::mcp::FrameDecoder;
use research_literature_library_native::retrieval_trace::validate_context;
use research_workbench_native_sdk::{
    literature_trace_protocol::{
        self as protocol, CAPABILITY_ID, CAPABILITY_VERSION, MAX_FRAME_BYTES, Request, RequestBody,
        Response, ResponseBody, TraceDecision,
    },
    retrieval_trace::MarkSentCondition,
};
use std::io::{self, Read, Write};

#[derive(Debug, thiserror::Error)]
pub(super) enum HostError {
    #[error("literature_host_input_failed: {0:?}")]
    Input(io::ErrorKind),
    #[error("literature_host_output_failed: {0:?}")]
    Output(io::ErrorKind),
    #[error("literature_host_protocol_invalid")]
    Protocol,
    #[error("literature_host_lifecycle_invalid")]
    Lifecycle,
    #[error("literature_host_identity_mismatch")]
    Identity,
    #[error("literature_host_input_closed_before_shutdown")]
    Closed,
    #[error("literature_host_snapshot_io: {0:?}")]
    SnapshotIo(io::ErrorKind),
    #[error("literature_host_snapshot_invalid")]
    SnapshotInvalid,
    #[error("literature_host_snapshot_integrity_mismatch")]
    SnapshotIntegrity,
    #[cfg(not(unix))]
    #[error("literature_host_platform_unsupported")]
    Unsupported,
}

struct Identity {
    package_key: String,
    instance_id: String,
}

impl Identity {
    fn from_request(request: &Request) -> Self {
        Self {
            package_key: request.package_key.clone(),
            instance_id: request.instance_id.clone(),
        }
    }

    fn matches(&self, request: &Request) -> bool {
        self.package_key == request.package_key && self.instance_id == request.instance_id
    }
}

pub(super) fn run(input: &mut impl Read, output: &mut impl Write) -> Result<(), HostError> {
    let mut decoder = FrameDecoder::with_max_frame_bytes(MAX_FRAME_BYTES);
    let mut identity: Option<Identity> = None;
    let mut chunk = [0_u8; 8192];
    loop {
        let count = match input.read(&mut chunk) {
            Ok(0) => return Err(HostError::Closed),
            Ok(count) => count,
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            Err(error) => return Err(HostError::Input(error.kind())),
        };
        let frames = decoder
            .push(&chunk[..count])
            .map_err(|_| HostError::Protocol)?;
        for (index, frame) in frames.iter().enumerate() {
            let request = protocol::decode_request(frame).map_err(|_| HostError::Protocol)?;
            if let Some(identity) = &identity
                && !identity.matches(&request)
            {
                return Err(HostError::Identity);
            }
            let shutdown = matches!(&request.body, RequestBody::Shutdown);
            let body = match (&identity, &request.body) {
                (None, RequestBody::Initialize) => {
                    identity = Some(Identity::from_request(&request));
                    ResponseBody::Initialized {
                        capability: CAPABILITY_ID.to_owned(),
                        version: CAPABILITY_VERSION,
                    }
                }
                (Some(_), RequestBody::DecideNoteTrace { snapshot }) => {
                    let input: protocol::SnapshotInput = snapshot::read(snapshot)?;
                    // Only the existing canonical rule chooses a domain outcome.
                    // The complete body is read unchanged, including NULs and
                    // oversized rejected input; no transport budget is applied.
                    let decision = match validate_context(None, &input.query, input.row) {
                        Ok(_) => TraceDecision::Ready {
                            mark_sent: MarkSentCondition::ORIGINAL,
                        },
                        Err(error) => TraceDecision::Rejected {
                            reason: error.into(),
                        },
                    };
                    ResponseBody::NoteTraceDecision { decision }
                }
                (
                    Some(_),
                    RequestBody::Catalog {
                        operation,
                        snapshot,
                    },
                ) => {
                    let input: research_workbench_native_sdk::catalog::CatalogInput =
                        snapshot::read(snapshot)?;
                    if input.operation() != *operation {
                        return Err(HostError::Protocol);
                    }
                    let result = research_literature_library_native::catalog::dispatch(input)
                        .map_err(|_| HostError::SnapshotInvalid)?;
                    ResponseBody::CatalogResult {
                        payload: snapshot::write_result(&request, &result)?,
                    }
                }
                (Some(_), RequestBody::Shutdown)
                    if index + 1 == frames.len() && decoder.is_empty() =>
                {
                    ResponseBody::ShutdownComplete
                }
                _ => return Err(HostError::Lifecycle),
            };
            let response = Response::for_request(&request, body);
            let bytes = protocol::encode_response(&response).map_err(|_| HostError::Protocol)?;
            output
                .write_all(&bytes)
                .map_err(|error| HostError::Output(error.kind()))?;
            output
                .flush()
                .map_err(|error| HostError::Output(error.kind()))?;
            if shutdown {
                return Ok(());
            }
        }
    }
}
