import {
  Controller,
  Post,
  Get,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { TplinkCloudService } from './tplink-cloud.service';

@Controller('api/tapo')
export class TplinkCloudController {
  // Inietta SOLO il Coordinatore, non importa nulla di Tapo o Kasa qui.
  constructor(private readonly cloudService: TplinkCloudService) {}

  @Get('list')
  async listDevices() {
    try {
      // Il Coordinatore scarica il cloud, legge i file, e interroga Kasa/Tapo da solo.
      const devices = await this.cloudService.getDevicesList();
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

    // Il Coordinatore riceve l'ordine e lo smista al protocollo giusto
    const success = await this.cloudService.setDevicePower(
      body.deviceId,
      body.state,
    );

    if (!success) {
      throw new HttpException(
        'Errore comunicazione dispositivo',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
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

    const success = await this.cloudService.setDeviceLight(
      body.deviceId,
      body.state,
      body.brightness || 100,
      body.color || 'white',
    );

    if (!success) {
      throw new HttpException(
        'Errore comunicazione luce',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return { status: 'OK' };
  }
}
