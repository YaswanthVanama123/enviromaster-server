/**
 * Zoho Test Controller
 * Handles Zoho API testing and diagnostic endpoints
 */

import {
  testZohoAccess,
  runZohoDiagnostics,
  testLayoutPipelineDetection,
  testV9SimplePipelineDetection,
  testV10LayoutPipelineCompatibility,
} from "../../services/zohoService.js";

export async function testZohoAccessEndpoint(_req, res) {
  try {
    console.log("🧪 [TEST-ENDPOINT] Testing Zoho access...");
    await testZohoAccess();

    res.json({
      success: true,
      message: "Zoho access test completed - check server logs for detailed results"
    });
  } catch (error) {
    console.error("❌ [TEST-ENDPOINT] Zoho access test failed:", error);
    res.status(500).json({
      success: false,
      error: "Zoho access test failed",
      detail: error.message
    });
  }
}

export async function runZohoDiagnosticsEndpoint(_req, res) {
  try {
    console.log("🧪 [DIAGNOSTICS-ENDPOINT] Running comprehensive Zoho diagnostics...");
    const results = await runZohoDiagnostics();

    res.json({
      success: true,
      message: "Zoho diagnostics completed - check server logs for detailed results",
      results: results
    });
  } catch (error) {
    console.error("❌ [DIAGNOSTICS-ENDPOINT] Zoho diagnostics failed:", error);
    res.status(500).json({
      success: false,
      error: "Zoho diagnostics failed",
      detail: error.message
    });
  }
}

export async function testV10CompatibilityEndpoint(_req, res) {
  try {
    console.log("🧪 [V10-TEST-ENDPOINT] Testing V10 Layout+Pipeline compatibility matching...");
    const results = await testV10LayoutPipelineCompatibility();

    res.json({
      success: true,
      message: "V10 Layout+Pipeline compatibility test completed - check server logs for detailed results",
      results: results
    });
  } catch (error) {
    console.error("❌ [V10-TEST-ENDPOINT] V10 compatibility test failed:", error);
    res.status(500).json({
      success: false,
      error: "V10 compatibility test failed",
      detail: error.message
    });
  }
}

export async function testV9SimplePipelineEndpoint(_req, res) {
  try {
    console.log("🧪 [V9-TEST-ENDPOINT] Testing V9 Simple Pipeline detection...");
    const results = await testV9SimplePipelineDetection();

    res.json({
      success: true,
      message: "V9 Simple Pipeline test completed - check server logs for detailed results",
      results: results
    });
  } catch (error) {
    console.error("❌ [V9-TEST-ENDPOINT] V9 Simple Pipeline test failed:", error);
    res.status(500).json({
      success: false,
      error: "V9 Simple Pipeline test failed",
      detail: error.message
    });
  }
}

export async function testV7LayoutPipelineEndpoint(_req, res) {
  try {
    console.log("🧪 [V7-TEST-ENDPOINT] Testing V7 Layout+Pipeline detection...");
    const results = await testLayoutPipelineDetection();

    res.json({
      success: true,
      message: "V7 Layout+Pipeline test completed - check server logs for detailed results",
      results: results
    });
  } catch (error) {
    console.error("❌ [V7-TEST-ENDPOINT] V7 Layout+Pipeline test failed:", error);
    res.status(500).json({
      success: false,
      error: "V7 Layout+Pipeline test failed",
      detail: error.message
    });
  }
}
