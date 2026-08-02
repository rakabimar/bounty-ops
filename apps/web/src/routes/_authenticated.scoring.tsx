import { createFileRoute } from "@tanstack/react-router";
import { CoreScoringPage } from "@/components/core-scoring-page";
export const Route = createFileRoute("/_authenticated/scoring")({ component: CoreScoringPage });
