import { Module } from '@nestjs/common';
import { TapoService } from './tapo.service';

@Module({
  providers: [TapoService],
  exports: [TapoService],
})
export class TapoModule {}
