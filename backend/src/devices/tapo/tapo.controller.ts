import {
  Controller,
  Post,
  Get,
  Body,
  HttpException,
  HttpStatus,
  Param,
} from '@nestjs/common';
import { TapoService } from './tapo.service';

@Controller('api/tapo')
export class TapoController {
  constructor(private readonly tapoService: TapoService) {}

  // GET /api/tapo/list
  // Ritorna l'elenco di tutte le prese con i loro deviceId, alias, status, ecc.
  @Get('list')
  async listDevices() {
    try {
      const devices = await this.tapoService.getPlugsList();
      return { status: 'OK', data: devices };
    } catch {
      throw new HttpException(
        'Impossibile recuperare i dispositivi dal cloud',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // TapoController
  @Get('status/:deviceId')
  async getDeviceStatus(@Param('deviceId') deviceId: string) {
    const status = await this.tapoService.getDeviceStatus(deviceId);
    if (status === null) {
      throw new HttpException(
        'Dispositivo non raggiungibile',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return { status: 'OK', isOn: status };
  }

  // POST /api/tapo/power
  // Body richiesto: { "deviceId": "8022E341...", "state": true }
  @Post('power')
  async controlPlug(@Body() body: { deviceId: string; state: boolean }) {
    if (!body.deviceId || typeof body.state !== 'boolean') {
      throw new HttpException(
        'Parametri mancanti: deviceId e state sono obbligatori',
        HttpStatus.BAD_REQUEST,
      );
    }

    const success = await this.tapoService.setPowerStateById(
      body.deviceId,
      body.state,
    );

    if (success) {
      return {
        status: 'OK',
        message: `Stato del dispositivo aggiornato con successo.`,
      };
    } else {
      throw new HttpException(
        'Errore di comunicazione con la presa locale. Controlla che sia accesa e nella stessa rete.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
