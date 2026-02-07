"use client";

import Link from "next/link";
import { useCampaigns, useUpdateCampaign, useDeleteCampaign } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatPercent } from "@/lib/utils";
import {
  Plus,
  MoreVertical,
  Play,
  Pause,
  Trash2,
  Megaphone,
  ArrowUpRight,
} from "lucide-react";

export default function CampaignsPage() {
  const { data: campaigns, isLoading } = useCampaigns();
  const updateCampaign = useUpdateCampaign();
  const deleteCampaign = useDeleteCampaign();

  const toggleStatus = (id: string, current: string) => {
    updateCampaign.mutate({ id, status: current === "active" ? "paused" : "active" });
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground">Manage your recovery campaigns</p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/dashboard/campaigns/new">
            <Plus className="h-4 w-4" />
            New Campaign
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : !campaigns || campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card py-16">
          <div className="rounded-xl bg-primary/10 p-4">
            <Megaphone className="h-8 w-8 text-primary" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">No campaigns yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first recovery campaign to start winning back customers.
          </p>
          <Button asChild className="mt-6 gap-2">
            <Link href="/dashboard/campaigns/new">
              <Plus className="h-4 w-4" />
              Create Campaign
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="group flex items-center gap-5 rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              {/* Icon */}
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Megaphone className="h-5 w-5 text-primary" />
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-semibold">{campaign.name}</h3>
                  <Badge
                    variant={campaign.status === "active" ? "default" : "secondary"}
                    className="text-[10px]"
                  >
                    {campaign.status}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {campaign.triggerType} · {campaign.messageCount} messages ·{" "}
                  {campaign.firstMessageDelayMinutes}m delay
                  {campaign.discountEnabled && ` · ${campaign.discountPercent}% discount`}
                </p>
              </div>

              {/* Stats */}
              <div className="hidden items-center gap-8 md:flex">
                <div className="text-right">
                  <p className="text-sm font-semibold">
                    {formatCurrency(parseFloat(campaign.recoveredRevenue))}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Recovered</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <p className="text-sm font-semibold">{formatPercent(campaign.recoveryRate)}</p>
                    <ArrowUpRight className="h-3 w-3 text-emerald-500" />
                  </div>
                  <p className="text-[10px] text-muted-foreground">Rate</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => toggleStatus(campaign.id, campaign.status)}
                  className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title={campaign.status === "active" ? "Pause" : "Resume"}
                >
                  {campaign.status === "active" ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </button>
                <button
                  onClick={() => {
                    if (confirm("Delete this campaign?")) deleteCampaign.mutate(campaign.id);
                  }}
                  className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
