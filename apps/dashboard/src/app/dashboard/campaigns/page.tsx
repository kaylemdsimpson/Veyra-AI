"use client";

import { useCampaigns, useUpdateCampaign, useDeleteCampaign } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { Plus, Trash2, Clock, Mail } from "lucide-react";
import Link from "next/link";

export default function CampaignsPage() {
  const { data: campaigns, isLoading } = useCampaigns();
  const updateCampaign = useUpdateCampaign();
  const deleteCampaign = useDeleteCampaign();

  const handleToggle = (id: string, currentStatus: string) => {
    updateCampaign.mutate({
      id,
      status: currentStatus === "active" ? "paused" : "active",
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-muted-foreground">Manage your recovery message sequences.</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/campaigns/new">
            <Plus className="mr-2 h-4 w-4" />
            Create campaign
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : campaigns && campaigns.length > 0 ? (
        <div className="space-y-4">
          {campaigns.map((campaign) => (
            <Card key={campaign.id}>
              <CardContent className="flex items-center justify-between py-6">
                <div className="flex items-center gap-6">
                  <Switch
                    checked={campaign.status === "active"}
                    onCheckedChange={() => handleToggle(campaign.id, campaign.status)}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{campaign.name}</h3>
                      <Badge
                        variant={
                          campaign.status === "active"
                            ? "success"
                            : campaign.status === "paused"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {campaign.status}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5" />
                        {campaign.messageCount} messages
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        First at {Math.round(campaign.firstMessageDelayMinutes / 60)}h
                      </span>
                      <span className="capitalize">{campaign.triggerType} abandons</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-lg font-semibold">
                      {formatCurrency(parseFloat(campaign.recoveredRevenue))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatPercent(campaign.recoveryRate)} recovery rate
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      if (confirm("Delete this campaign?")) {
                        deleteCampaign.mutate(campaign.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader className="text-center py-12">
            <CardTitle className="text-lg">No campaigns yet</CardTitle>
            <CardDescription>
              Create your first recovery campaign to start recovering abandoned revenue.
            </CardDescription>
            <div className="mt-4">
              <Button asChild>
                <Link href="/dashboard/campaigns/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Create campaign
                </Link>
              </Button>
            </div>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
