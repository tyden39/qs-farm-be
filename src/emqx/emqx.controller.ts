import { Controller, Post, Body, Logger } from '@nestjs/common';
import { ApiTags, ApiBody, ApiResponse } from '@nestjs/swagger';
import { EmqxService } from './emqx.service';
import { EmqxAuthDto } from './dto/emqx-auth.dto';
import { EmqxAclDto, EmqxAclResponse } from './dto/emqx-acl.dto';

@ApiTags('EMQX')
@Controller('emqx')
export class EmqxController {
  private readonly logger = new Logger(EmqxController.name);

  constructor(private readonly emqxService: EmqxService) {}

  /**
   * EMQX HTTP authentication hook
   * Called by EMQX broker to verify client credentials
   */
  @Post('auth')
  @ApiBody({ type: EmqxAuthDto })
  @ApiResponse({ status: 200, description: 'Authentication result' })
  async authenticate(@Body() body: EmqxAuthDto) {
    const result = await this.emqxService.authenticate(body);

    this.logger.debug(
      `Auth: ${body.username} - ${result ? 'ALLOW' : 'DENY'}`,
    );

    return {
      result: result ? 'allow' : 'deny',
    };
  }

  /**
   * EMQX HTTP ACL hook
   * Called by EMQX broker to verify pub/sub permissions
   */
  @Post('acl')
  @ApiBody({ type: EmqxAclDto })
  @ApiResponse({ status: 200, type: EmqxAclResponse })
  async checkAcl(@Body() body: EmqxAclDto) {
    const result = await this.emqxService.checkAcl(body);

    const accessType = body.access === 1 ? 'SUB' : 'PUB';
    this.logger.debug(
      `ACL: ${body.username} ${accessType} ${body.topic} - ${result ? 'ALLOW' : 'DENY'}`,
    );

    return {
      result: result ? 'allow' : 'deny',
    };
  }
}
