import { Controller, Get, Header, NotFoundException, Res } from '@nestjs/common';
import type { Response } from 'express';
import { env } from '../env';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async prometheus(@Res({ passthrough: true }) res: Response): Promise<string> {
    if (!env.METRICS_ENABLED) throw new NotFoundException();
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return this.metrics.renderPrometheus();
  }
}
