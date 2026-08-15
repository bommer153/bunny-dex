import { EconomyTransaction, User } from "@bunnydex/database";
import type { Currency } from "@bunnydex/types";
import { DomainError } from "../errors.js";
import mongoose from "mongoose";

export type EconomyMutation = {
  userId: string;
  currency: Currency;
  amount: number;
  type: string;
  idempotencyKey: string;
  counterpartyId?: string;
  refType?: string;
  refId?: string;
  meta?: Record<string, unknown>;
  session?: mongoose.ClientSession;
};

export class EconomyService {
  static async credit(input: EconomyMutation) {
    if (input.amount <= 0) {
      throw new DomainError("VALIDATION", "Credit amount must be positive.");
    }
    return this.mutate({ ...input, amount: Math.abs(input.amount) });
  }

  static async debit(input: EconomyMutation) {
    if (input.amount <= 0) {
      throw new DomainError("VALIDATION", "Debit amount must be positive.");
    }
    return this.mutate({ ...input, amount: -Math.abs(input.amount) });
  }

  private static async mutate(input: EconomyMutation) {
    const existing = await EconomyTransaction.findOne({
      idempotencyKey: input.idempotencyKey,
    }).session(input.session ?? null);
    if (existing) {
      const user = await User.findById(input.userId).session(input.session ?? null);
      return { user, transaction: existing, replayed: true };
    }

    const field = input.currency;
    const filter: Record<string, unknown> = { _id: input.userId };
    if (input.amount < 0) {
      filter[field] = { $gte: Math.abs(input.amount) };
    }

    const updated = await User.findOneAndUpdate(
      filter,
      { $inc: { [field]: input.amount } },
      { new: true, session: input.session },
    );

    if (!updated) {
      throw new DomainError(
        input.amount < 0 ? "INSUFFICIENT_FUNDS" : "NOT_FOUND",
        input.amount < 0 ? `Not enough ${field}.` : "User not found.",
      );
    }

    try {
      const transaction = await EconomyTransaction.create(
        [
          {
            type: input.type,
            userId: input.userId,
            counterpartyId: input.counterpartyId,
            amount: input.amount,
            currency: input.currency,
            balanceAfter: updated[field],
            refType: input.refType,
            refId: input.refId,
            idempotencyKey: input.idempotencyKey,
            meta: input.meta,
          },
        ],
        { session: input.session },
      );
      return { user: updated, transaction: transaction[0], replayed: false };
    } catch (err: unknown) {
      const code = (err as { code?: number }).code;
      if (code === 11000) {
        const tx = await EconomyTransaction.findOne({
          idempotencyKey: input.idempotencyKey,
        });
        return { user: updated, transaction: tx, replayed: true };
      }
      throw err;
    }
  }

  static async getHistory(userId: string, limit = 20) {
    return EconomyTransaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }
}
