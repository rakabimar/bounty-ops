import { createFileRoute } from "@tanstack/react-router";
import { RulesPage } from "@/components/core-program-pages";
export const Route=createFileRoute("/_authenticated/rules")({component:RulesPage});
