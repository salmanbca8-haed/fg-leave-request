const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

test("end-to-end approval and rejection workflow on running server", async (t) => {
  const baseUrl = "http://localhost:3000";
  const adminPassword = process.env.E2E_ADMIN_PASSWORD;

  // Check if server is running; skip if not running
  if (!adminPassword) {
    t.skip("Set E2E_ADMIN_PASSWORD to run the integration test against a configured server");
    return;
  }
  try {
    const ping = await fetch(`${baseUrl}/api/settings`);
    if (!ping.ok) {
      t.skip("Server not responding on port 3000");
      return;
    }
  } catch {
    t.skip("Server not reachable on port 3000");
    return;
  }

  // 1. Submit leave request with fresh unique idempotency key
  const submitRes = await fetch(`${baseUrl}/api/requests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      name: "Priya Sundaram",
      id: "EMP-3091",
      email: "priya@fuglide.com",
      department: "Human Resources",
      startDate: "2026-11-10",
      endDate: "2026-11-12",
      leaveType: "Sick Leave",
      unit: "days",
      reason: "Recovery from minor medical procedure.",
      notes: "Handed over active tickets to Arjun.",
    }),
  });

  assert.equal(submitRes.status, 200, `Expected 200 on submit, got ${submitRes.status}`);
  const submitData = await submitRes.json();
  const ref = submitData.reference;
  console.log("✔ Request submitted successfully with reference:", ref);
  assert.equal(submitData.approvalStatus, "pending");

  // 2. Check public status endpoint
  const statusRes = await fetch(`${baseUrl}/api/requests/${ref}/status`);
  assert.equal(statusRes.status, 200);
  const statusData = await statusRes.json();
  console.log("✔ Initial status check:", statusData.approvalStatus);
  assert.equal(statusData.approvalStatus, "pending");

  // 3. Verify PDF is blocked while pending
  const pdfPendingRes = await fetch(`${baseUrl}/api/requests/${ref}/pdf`);
  assert.equal(pdfPendingRes.status, 403, "PDF download must be blocked (403) while pending");
  console.log("✔ PDF download correctly blocked (403) while pending");

  // 4. Admin login
  const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: adminPassword }),
  });
  assert.equal(loginRes.status, 200);
  const cookieHeader = loginRes.headers.get("set-cookie");
  const authCookie = cookieHeader ? cookieHeader.split(";")[0] : "";
  console.log("✔ Admin login successful");

  // 5. Admin lists requests
  const adminReqsRes = await fetch(`${baseUrl}/api/admin/requests`, {
    headers: { Cookie: authCookie },
  });
  assert.equal(adminReqsRes.status, 200);
  const adminReqs = await adminReqsRes.json();
  const found = adminReqs.find((r) => r.reference === ref);
  assert.ok(found, "Submitted request must be visible to admin");
  console.log("✔ Request found in admin inbox with status:", found.approvalStatus);

  // 6. Admin approves request
  const approveRes = await fetch(`${baseUrl}/api/admin/requests/${ref}/status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: authCookie,
    },
    body: JSON.stringify({ status: "approved", remarks: "Approved by Admin. Take care!" }),
  });
  assert.equal(approveRes.status, 200);
  console.log("✔ Admin approved the request");

  // 7. Verify status is now approved for employee
  const statusApprovedRes = await fetch(`${baseUrl}/api/requests/${ref}/status`);
  const statusApprovedData = await statusApprovedRes.json();
  assert.equal(statusApprovedData.approvalStatus, "approved");
  assert.equal(statusApprovedData.adminRemarks, "Approved by Admin. Take care!");
  console.log("✔ Employee status verified: APPROVED");

  // 8. Verify PDF is now unlocked for download
  const pdfApprovedRes = await fetch(`${baseUrl}/api/requests/${ref}/pdf`);
  assert.equal(pdfApprovedRes.status, 200, "PDF download must succeed when approved");
  assert.equal(pdfApprovedRes.headers.get("content-type"), "application/pdf");
  const pdfBuffer = await pdfApprovedRes.arrayBuffer();
  assert.ok(pdfBuffer.byteLength > 500, "PDF buffer must contain valid document bytes");
  console.log("✔ PDF download unlocked and successfully generated (bytes:", pdfBuffer.byteLength, ")");

  // 9. Admin rejects request (to test rejection workflow)
  const rejectRes = await fetch(`${baseUrl}/api/admin/requests/${ref}/status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: authCookie,
    },
    body: JSON.stringify({ status: "rejected", remarks: "Team capacity limit reached." }),
  });
  assert.equal(rejectRes.status, 200);
  const statusRejectedRes = await fetch(`${baseUrl}/api/requests/${ref}/status`);
  const statusRejectedData = await statusRejectedRes.json();
  assert.equal(statusRejectedData.approvalStatus, "rejected");
  console.log("✔ Employee status verified: NOT APPROVED (rejected)");

  // 10. Verify PDF is blocked again when rejected
  const pdfRejectedRes = await fetch(`${baseUrl}/api/requests/${ref}/pdf`);
  assert.equal(pdfRejectedRes.status, 403, "PDF download must be blocked when rejected");
  console.log("✔ PDF download correctly blocked (403) when rejected");

  console.log("\n========================================================");
  console.log("🎉 ALL END-TO-END APPROVAL WORKFLOW TESTS PASSED!");
  console.log("========================================================\n");
});
