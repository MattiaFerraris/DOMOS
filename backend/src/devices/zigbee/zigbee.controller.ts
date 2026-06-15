import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { MqttService } from './mqtt.service';

// Controller dedicato ai dispositivi Zigbee (via zigbee2mqtt + chiavetta Sonoff).
@Controller('api/zigbee')
export class ZigbeeController {
  constructor(private readonly mqttService: MqttService) {}

  @Get('list')
  listDevices() {
    return { status: 'OK', data: this.mqttService.listDevices() };
  }

  @Get('state')
  getState(@Query('device') device: string) {
    if (!device) {
      throw new HttpException('device mancante', HttpStatus.BAD_REQUEST);
    }
    return { status: 'OK', data: this.mqttService.getState(device) };
  }

  @Post('power')
  controlPower(@Body() body: { device: string; state: boolean }) {
    if (!body.device || typeof body.state !== 'boolean') {
      throw new HttpException('Parametri mancanti', HttpStatus.BAD_REQUEST);
    }
    const ok = this.mqttService.setPower(body.device, body.state);
    if (!ok) {
      throw new HttpException(
        'Broker MQTT non connesso',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return { status: 'OK' };
  }

  @Post('light')
  controlLight(
    @Body()
    body: {
      device: string;
      state: boolean;
      brightness?: number;
      color?: string;
    },
  ) {
    if (!body.device || typeof body.state !== 'boolean') {
      throw new HttpException('Parametri mancanti', HttpStatus.BAD_REQUEST);
    }
    const ok = this.mqttService.setLight(
      body.device,
      body.state,
      body.brightness ?? 100,
      body.color,
    );
    if (!ok) {
      throw new HttpException(
        'Broker MQTT non connesso',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return { status: 'OK' };
  }
}
