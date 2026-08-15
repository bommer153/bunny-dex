import { AchievementService } from "./services/achievement-service.js";
import { QuestService } from "./services/quest-service.js";

let initialized = false;

export function initGameEngine() {
  if (initialized) return;
  AchievementService.registerListeners();
  QuestService.registerListeners();
  initialized = true;
}

export { DomainError } from "./errors.js";
export { EventBus } from "./event-bus.js";
export { ConfigService } from "./services/config-service.js";
export { UserService } from "./services/user-service.js";
export { EconomyService } from "./services/economy-service.js";
export { CardCatalogService } from "./services/card-catalog-service.js";
export { CardService } from "./services/card-service.js";
export { InventoryService } from "./services/inventory-service.js";
export { LootTableService } from "./services/loot-table-service.js";
export { HuntService } from "./services/hunt-service.js";
export { PackService } from "./services/pack-service.js";
export { LootBoxService } from "./services/loot-box-service.js";
export { ShopService } from "./services/shop-service.js";
export { DailyService, WorkService } from "./services/daily-work-service.js";
export { GamblingService } from "./services/gambling-service.js";
export { DeckService } from "./services/deck-service.js";
export { BattleService } from "./services/battle-service.js";
export { MatchmakingService } from "./services/matchmaking-service.js";
export { TradeService } from "./services/trade-service.js";
export { MarketplaceService } from "./services/marketplace-service.js";
export { CollectionService } from "./services/collection-service.js";
export { AchievementService } from "./services/achievement-service.js";
export { QuestService } from "./services/quest-service.js";
export { LeaderboardService } from "./services/leaderboard-service.js";
export { AdminService } from "./services/admin-service.js";
