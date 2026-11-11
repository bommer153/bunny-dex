export type GameErrorCode = "NOT_FOUND" | "COOLDOWN" | "INSUFFICIENT_FUNDS" | "INVALID" | "FORBIDDEN" | "CONFLICT";

/** An expected, player-facing error. Its message is safe to show in Discord or on the web. */
export class GameError extends Error {
  constructor(
    readonly code: GameErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GameError";
  }
}

export const fail = (code: GameErrorCode, message: string): never => {
  throw new GameError(code, message);
};
