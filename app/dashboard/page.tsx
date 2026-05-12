import { ToolSuiteDashboard } from "@/app/dashboard/tool-suite-dashboard";
import { createGeneratedToolAudit } from "@/lib/agents/generated-audit";
import { readGeneratedAgentManifests } from "@/lib/agents/generated-registry";
import { createPlatformHardeningAudit } from "@/lib/agents/platform-hardening";
import { getAgentManifests } from "@/lib/agents/registry";
import { isGatewayConfigured } from "@/lib/ai/gateway";

export default function DashboardPage() {
  const manifests = getAgentManifests();
  const generatedAudit = createGeneratedToolAudit(readGeneratedAgentManifests(), {
    checkFiles: true,
  });
  const platformAudit = createPlatformHardeningAudit(manifests);

  return (
    <ToolSuiteDashboard
      generatedAudit={generatedAudit}
      hasGatewayKey={isGatewayConfigured()}
      manifests={manifests}
      platformAudit={platformAudit}
    />
  );
}
