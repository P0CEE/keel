"use client";

import type { ReactNode } from "react";

import {
  BudgetCard,
  DisponibleCard,
  EverydayCard,
  ProjectionCard,
  SavingsCard,
  SpendingCard,
  StreakCard,
  SubscriptionsCard,
} from "./cards";
import { ActivityWidget, DuesWidget, ForYouWidget } from "./side";
import type { WidgetId } from "@keel/finance/home";

/**
 * What draws each widget of the registry (`@keel/finance/home`); the record
 * is exhaustive, so a widget added there fails the typecheck until it has
 * a component here.
 */
export const WIDGET_COMPONENTS: Readonly<Record<WidgetId, () => ReactNode>> = {
  spending: SpendingCard,
  disponible: DisponibleCard,
  budget: BudgetCard,
  savings: SavingsCard,
  everyday: EverydayCard,
  subscriptions: SubscriptionsCard,
  streak: StreakCard,
  projection: ProjectionCard,
  "for-you": ForYouWidget,
  activity: ActivityWidget,
  dues: DuesWidget,
};
