import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminUI";
import { FeedbackEmails } from "@/components/admin/FeedbackEmails";

export default async function FeedbackEmailsPage() {
  await requireAdmin("/admin/emails");
  const [campaigns, userCount] = await Promise.all([
    prisma.feedbackCampaign.findMany({ orderBy: { createdAt: "desc" }, take: 30, select: { id: true, subject: true, status: true, createdAt: true } }),
    prisma.userProfile.count(),
  ]);
  return <>
    <AdminPageHeader eyebrow="Customer feedback" title="Feedback emails" description="Ask registered users about bugs and improvements. Review your audience and message before sending." />
    <FeedbackEmails campaigns={campaigns.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() }))} userCount={userCount} />
  </>;
}
