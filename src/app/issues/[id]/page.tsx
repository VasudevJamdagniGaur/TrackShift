import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/layout/site-header";
import { IssueDetailView } from "@/components/issues/issue-detail";
import { Button } from "@/components/ui/button";
import { getIssueById, getIssueHistory } from "@/data/mock";

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const issue = getIssueById(id);
  if (!issue) notFound();
  const history = getIssueHistory(id);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8 page-enter">
        <div className="mb-4">
          <Button asChild variant="ghost" size="sm">
            <Link href="/issues">← Back to issues</Link>
          </Button>
        </div>
        <IssueDetailView issue={issue} history={history} />
      </main>
    </div>
  );
}
