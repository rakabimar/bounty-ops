import { createFileRoute } from "@tanstack/react-router";
import { ScopePage } from "@/components/core-program-pages";
export const Route=createFileRoute("/_authenticated/scope")({component:ScopePage});
