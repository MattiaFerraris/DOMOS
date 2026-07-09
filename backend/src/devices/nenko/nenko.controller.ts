import {
  Controller,
  Post,
  Get,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { NenkoService } from './nenko.service';

// Controller per la luce Nenko (via dongle nRF52840 → 802.15.4 raw).
@Controller('api/nenko')
export class NenkoController {
  constructor(private readonly nenkoService: NenkoService) {}

  @Get('state')
  getState() {
    return { status: 'OK', data: this.nenkoService.getState() };
  }

  // Elenco dei preset disponibili (per costruire i pulsanti nella UI).
  @Get('presets')
  listPresets() {
    return { status: 'OK', data: this.nenkoService.listPresets() };
  }

  @Post('preset')
  async controlPreset(@Body() body: { name: string }) {
    const ok = await this.nenkoService.sendPreset(body.name);
    if (!ok) {
      throw new HttpException(
        'Invio preset fallito',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return { status: 'OK' };
  }
}
