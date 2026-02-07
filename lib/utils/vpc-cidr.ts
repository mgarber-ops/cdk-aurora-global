/**
 * Maps AWS regions to unique VPC CIDR blocks
 * Each region gets a unique /16 CIDR block
 */
export function getVpcCidrForRegion(region: string): string {
  const cidrMap: Record<string, string> = {
    'us-east-1': '10.0.0.0/16',
    'us-west-2': '10.1.0.0/16',
  };

  if (cidrMap[region]) {
    return cidrMap[region];
  }

  throw new Error(`Unsupported region: ${region}. Only us-east-1 and us-west-2 are supported.`);
}
