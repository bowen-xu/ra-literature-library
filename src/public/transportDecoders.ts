/** Domain decoders used by App-owned fixed native adapters. No transport handles. */
export {decodeConcept, decodeConceptCaptureResult, decodeConceptIdentityEvent, decodeConceptMergeImpact, decodeDefinitionClaim, decodeList, decodePaperReadingProfileSelection, decodeReadingProfile, decodeRelationAssertion, decodeRelationNode, decodeReadingUnit, decodeResearchObjectRevision} from "../services/knowledgeDecoders";
export {decodeConceptAlgorithmRun} from "../services/conceptAlgorithmDecoders";
export {decodeClaim, decodeEvidenceLink, decodeEvidenceList, decodeSourceAnchorSummary} from "../services/evidenceDecoders";
export {decodeEvidenceMatrices, decodeEvidenceMatrix, decodeEvidenceMatrixCell, decodeEvidenceMatrixCells} from "../services/evidenceMatrixDecoders";
export {decodeDerivedResearchView, decodeDerivedResearchViews} from "../services/derivedViewDecoders";
export {decodeReferenceRecord, decodeReferenceRecords} from "../services/referenceRecordDecoders";
export {literatureAttachmentBytes, literatureCommandError, collectionCommandError, decodeNalQueryStore, validateNalAnnotationRequest, decodeNalAnnotationResponse} from "../services/transportValidation";
