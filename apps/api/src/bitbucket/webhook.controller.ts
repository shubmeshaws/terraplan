import { Body, Controller, Headers, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { BitbucketService } from './bitbucket.service';

/**
 * Public Bitbucket Cloud webhook receiver.
 * Configure the URL shown in Admin → Bitbucket integration.
 * Optional shared secret: header `X-Terraplan-Webhook-Secret` or `Authorization: Bearer …`.
 */
@Controller('hooks')
export class BitbucketWebhookController {
  constructor(private readonly bitbucket: BitbucketService) {}

  @Post('bitbucket')
  handle(
    @Body() body: Record<string, unknown>,
    @Headers() headers: Record<string, string | undefined>,
    @Req() req: Request,
  ) {
    const event =
      headers['x-event-key'] ||
      headers['x-bitbucket-event'] ||
      (typeof body.event === 'string' ? body.event : 'unknown');
    // Express lowercases header names.
    const normalized: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(headers)) normalized[k.toLowerCase()] = v;
    void req;
    return this.bitbucket.handleWebhook(event, body ?? {}, normalized);
  }
}
