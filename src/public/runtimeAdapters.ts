/** App statically supplies fixed native ports; browser workflow and call-time
 * dispatch remain domain-owned. This does not register or select runtimes. */
export {createCollectionGateway} from "../services/collectionGateway";
export {createNalGateway} from "../services/nalGateway";
export {createNalQueryGateway} from "../services/nalQueryGateway";
