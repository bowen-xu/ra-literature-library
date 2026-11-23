import { splitConceptName } from "@research-assistant/core/knowledge";
import "./ConceptName.css";

export function ConceptName({label}: {readonly label: string}) {
  const {name, context} = splitConceptName(label);
  return <span className="concept-name"><span>{name}</span>{context && <span className="concept-name-context">{context}</span>}</span>;
}
