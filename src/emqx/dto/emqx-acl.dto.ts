export class EmqxAclDto {
  username: string;
  clientid?: string;
  ip_address?: string;
  access: number; // 1 = subscribe, 2 = publish
  topic: string;
}

export class EmqxAclResponse {
  result: 'allow' | 'deny';
}
