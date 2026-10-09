/* v17 test helper. Since v17 no product can be sold (not even in the sandbox) without a recorded,
   owner-level compliance approval with scope "sale". Tests that exercise checkout record one first,
   exactly as an owner would in admin. */
export const APPROVAL_CONFIRMATION = 'I_CONFIRM_A_QUALIFIED_REVIEWER_APPROVED_THIS_PUBLICATION';

export async function approveForSale(baseUrl, headers, productId, markets = ['SE', 'DE', 'FI', 'DK', 'NL']) {
  const response = await fetch(`${baseUrl}/api/admin/compliance/${encodeURIComponent(productId)}`, {
    method: 'PATCH',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ status: 'approved_for_publication', scope: 'sale', markets, reviewReference: 'TEST-REVIEW-001', reviewer: 'Test reviewer (automated test)', confirmation: APPROVAL_CONFIRMATION, note: 'Automated test approval on a temporary database.' })
  });
  const payload = await response.json();
  if (response.status !== 200) throw new Error(`approveForSale failed: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}
