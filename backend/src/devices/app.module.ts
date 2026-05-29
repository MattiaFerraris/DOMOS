import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { TapoModule } from './tapo/tapo.module';

@Module({
  imports: [TapoModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
