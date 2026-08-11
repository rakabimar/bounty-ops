import { createFileRoute } from "@tanstack/react-router";
import { ChangesPage } from "@/components/core-recon-over-time";

export const Route = createFileRoute("/_authenticated/changes")({
  component: ChangesPage,
});
