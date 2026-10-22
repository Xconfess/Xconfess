import {
  PENDING_MESSAGE_DRAFT_KEY,
  savePendingMessageDraft,
  takePendingMessageDraft,
} from "../pendingMessageDraft";

describe("pending private-message drafts", () => {
  let storage: Storage;

  beforeEach(() => {
    sessionStorage.clear();
    storage = sessionStorage;
  });

  it("restores a draft only for its identity and thread, then removes it", () => {
    savePendingMessageDraft(storage, {
      anonymousUserId: "identity-1",
      confessionId: "confession-1",
      senderId: "sender-1",
      content: "A private draft",
    });

    expect(
      takePendingMessageDraft(storage, "identity-1", {
        confessionId: "confession-1",
        senderId: "sender-1",
      }),
    ).toBe("A private draft");
    expect(storage.getItem(PENDING_MESSAGE_DRAFT_KEY)).toBeNull();
  });

  it("does not expose a draft to a different identity", () => {
    savePendingMessageDraft(storage, {
      anonymousUserId: "identity-1",
      confessionId: "confession-1",
      senderId: "sender-1",
      content: "A private draft",
    });

    expect(
      takePendingMessageDraft(storage, "identity-2", {
        confessionId: "confession-1",
        senderId: "sender-1",
      }),
    ).toBeNull();
    expect(storage.getItem(PENDING_MESSAGE_DRAFT_KEY)).toBeNull();
  });

  it("keeps the draft until its matching thread is selected", () => {
    savePendingMessageDraft(storage, {
      anonymousUserId: "identity-1",
      confessionId: "confession-1",
      senderId: "sender-1",
      content: "A private draft",
    });

    expect(
      takePendingMessageDraft(storage, "identity-1", {
        confessionId: "another-confession",
        senderId: "sender-1",
      }),
    ).toBeNull();
    expect(storage.getItem(PENDING_MESSAGE_DRAFT_KEY)).not.toBeNull();
  });
});
