import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { SchedulerService, RecurringSchedule } from './scheduler.service';

@Controller('api/scheduler')
export class SchedulerController {
  constructor(private readonly scheduler: SchedulerService) {}

  // ── Timer one-shot ──────────────────────────────────────────────
  @Get('timers')
  listTimers() {
    return { status: 'OK', data: this.scheduler.listTimers() };
  }

  @Post('timer')
  addTimer(
    @Body()
    body: {
      deviceId: string;
      delayMinutes: number;
      targetState: boolean;
    },
  ) {
    if (
      !body.deviceId ||
      typeof body.delayMinutes !== 'number' ||
      typeof body.targetState !== 'boolean'
    ) {
      throw new HttpException('Parametri mancanti', HttpStatus.BAD_REQUEST);
    }
    const timer = this.scheduler.addTimer(
      body.deviceId,
      body.delayMinutes,
      body.targetState,
    );
    return { status: 'OK', data: timer };
  }

  @Delete('timer/:id')
  cancelTimer(@Param('id') id: string) {
    this.scheduler.cancelTimer(id);
    return { status: 'OK' };
  }

  // ── Schedulazioni ricorrenti ────────────────────────────────────
  @Get('schedules')
  listSchedules() {
    return { status: 'OK', data: this.scheduler.listSchedules() };
  }

  @Post('schedule')
  addSchedule(@Body() body: Omit<RecurringSchedule, 'id'>) {
    if (
      !body.deviceId ||
      typeof body.targetState !== 'boolean' ||
      !/^\d{2}:\d{2}$/.test(body.time) ||
      !Array.isArray(body.days)
    ) {
      throw new HttpException('Parametri non validi', HttpStatus.BAD_REQUEST);
    }
    const schedule = this.scheduler.addSchedule({
      deviceId: body.deviceId,
      targetState: body.targetState,
      time: body.time,
      days: body.days,
      enabled: body.enabled ?? true,
    });
    return { status: 'OK', data: schedule };
  }

  @Patch('schedule/:id')
  updateSchedule(
    @Param('id') id: string,
    @Body() patch: Partial<Omit<RecurringSchedule, 'id'>>,
  ) {
    const schedule = this.scheduler.updateSchedule(id, patch);
    if (!schedule) {
      throw new HttpException(
        'Schedulazione non trovata',
        HttpStatus.NOT_FOUND,
      );
    }
    return { status: 'OK', data: schedule };
  }

  @Delete('schedule/:id')
  deleteSchedule(@Param('id') id: string) {
    this.scheduler.deleteSchedule(id);
    return { status: 'OK' };
  }
}
