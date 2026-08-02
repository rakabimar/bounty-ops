import { createFileRoute } from "@tanstack/react-router";
import { CoreReviewPage } from "@/components/core-review-page";
export const Route = createFileRoute("/_authenticated/review")({ component: CoreReviewPage });
