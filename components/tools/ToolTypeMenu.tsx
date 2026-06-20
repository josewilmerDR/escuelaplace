/**
 * The tools hub's "create" catalog: one card per tool kind (rifa, bingo, venta…), each a
 * link to the dedicated creation page (/panel/school/[id]/tools/new?type=…). Unlike
 * <ToolTypePicker> (a radiogroup form input that toggles an inline form), these cards only
 * navigate — so the hub stays a pure catalog and each kind's form lives on its own page.
 *
 * Server-safe: it's plain links + the shared <ToolTypeCardBody>, no client state.
 */
import Link from "next/link";
import { ToolTypeCardBody } from "@/components/tools/ToolTypePicker";
import { cardClass } from "@/components/ui/Card";
import { TOOL_TYPE_LIST } from "@/lib/tools/registry";

export function ToolTypeMenu({ schoolId }: { schoolId: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {TOOL_TYPE_LIST.map((t) => (
        <Link
          key={t.key}
          href={`/panel/school/${schoolId}/tools/new?type=${t.key}`}
          className={`flex flex-col gap-2 ${cardClass(
            "elevated",
            false,
          )} p-4 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
        >
          <ToolTypeCardBody meta={t} />
        </Link>
      ))}
    </div>
  );
}
