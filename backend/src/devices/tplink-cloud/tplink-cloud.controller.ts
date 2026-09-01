import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { TplinkCloudService } from './tplink-cloud.service';

@Controller('api/tapo')
export class TplinkCloudController {
  private readonly logger = new Logger(TplinkCloudController.name);

  // Inietta coordinatore
  constructor(private readonly cloudService: TplinkCloudService) {}

  @Get('list')
  async listDevices() {
    try {
      // Il Coordinatore scarica il cloud, legge i file, e interroga Kasa/Tapo da solo.
      const devices = await this.cloudService.getDevicesList();
      return { status: 'OK', data: devices };
    } catch (error) {
      // Senza questo log il fallimento del Cloud era invisibile: restava solo
      // un 500 generico e nessuna traccia della causa reale.
      this.logger.error(
        `Errore recupero dispositivi: ${(error as Error).message}`,
        (error as Error).stack,
      );
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

    // Il coordinatore riceve l'ordine e lo smista al protocollo giusto
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

  @Get('energy')
  async getEnergy(@Query('deviceId') deviceId: string) {
    if (!deviceId) {
      throw new HttpException('deviceId mancante', HttpStatus.BAD_REQUEST);
    }
    const data = await this.cloudService.getDeviceEnergy(deviceId);
    return { status: 'OK', data };
  }

  @Get('info')
  async getInfo(@Query('deviceId') deviceId: string) {
    if (!deviceId) {
      throw new HttpException('deviceId mancante', HttpStatus.BAD_REQUEST);
    }
    const data = await this.cloudService.getDeviceInfo(deviceId);
    return { status: 'OK', data };
  }
}
