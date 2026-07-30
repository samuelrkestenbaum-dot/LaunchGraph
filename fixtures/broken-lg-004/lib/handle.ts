export async function handleEvent(event: unknown): Promise<void> {
  // Inert placeholder: pretend to process the event.
  void event;
}

// The entitlement downgrade the cancellation branch reaches. Inert placeholder
// — present so this fixture seeds LG-004 only, never LG-006.
export async function downgradeEntitlement(customerId: string): Promise<void> {
  void customerId;
}
