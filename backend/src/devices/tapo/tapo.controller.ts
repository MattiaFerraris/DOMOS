import {
  Controller,
  Post,
  Get,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { TapoService } from './tapo.service';

@Controller('api/tapo')
export class TapoController {
  constructor(private readonly tapoService: TapoService) {}

  @Get('list')
  async listDevices() {
    try {
      const devices = await this.tapoService.getDevicesList();
      return { status: 'OK', data: devices };
    } catch {
      throw new HttpException(
        'Errore recupero dispositivi',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('power')
  async controlPlug(@Body() body: { deviceId: string; state: boolean }) {
    if (!body.deviceId || typeof body.state !== 'boolean') {
      throw new HttpException('Parametri mancanti', HttpStatus.BAD_REQUEST);
    }
    const success = await this.tapoService.setPowerStateById(
      body.deviceId,
      body.state,
    );
    if (!success)
      throw new HttpException(
        'Errore comunicazione locale',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    return { status: 'OK' };
  }

  @Post('light')
  async controlLight(
    @Body()
    body: {
      deviceId: string;
      state: boolean;
      color: string;
      brightness: number;
    },
  ) {
    if (!body.deviceId || typeof body.state !== 'boolean') {
      throw new HttpException('Parametri mancanti', HttpStatus.BAD_REQUEST);
    }
    const success = await this.tapoService.setLightStripState(
      body.deviceId,
      body.state,
      body.brightness || 100,
      body.color || 'white',
    );
    if (!success)
      throw new HttpException(
        'Errore comunicazione luce',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    return { status: 'OK' };
  }
}
