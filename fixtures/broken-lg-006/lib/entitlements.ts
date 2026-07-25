// Inert placeholder. Note there is deliberately NO downgrade / revoke function
// anywhere in this repository: the seeded LG-006 defect is that cancellation is
// never handled at all, not that it is handled badly.
export async function grantEntitlement(customerId: string): Promise<void> {
  void customerId;
}
