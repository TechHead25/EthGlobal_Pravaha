/**
 * @file workflow.ts
 * @notice Chainlink Runtime Environment (CRE) Workflow Definition.
 * Adheres to the official @chainlink/cre-sdk workflow pattern with trigger binding,
 * node-mode off-chain evidence collection, consensus aggregation, and bounded attestation.
 */

import {
  creWorkflow,
  CreVerificationResult,
  CreWorkflowInput,
} from "../src/lib/cre";

export * from "../src/lib/cre";

/**
 * CRE Trigger Handler definition.
 * In a deployed CRE WASM container, this handler is invoked when an HTTP trigger
 * or EVM event fires.
 */
export async function onDeliveryVerificationTrigger(
  payload: CreWorkflowInput
): Promise<CreVerificationResult> {
  // Execute via multi-node DON consensus simulation mode
  return await creWorkflow.execute(payload, {
    mode: "DON_SIMULATION",
    nodeCount: 4,
    simulateFaultyNode: false,
  });
}

/**
 * Standard CRE workflow definition export compatible with CRE runtime runner.
 */
export const workflowDefinition = {
  name: "openaid-delivery-verification",
  version: "1.0.0",
  trigger: "HTTP_POST_/verify-delivery",
  handler: onDeliveryVerificationTrigger,
};

export default workflowDefinition;
