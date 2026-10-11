import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.setGlobalPrefix(process.env.API_PREFIX || 'api');
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Analizador de Hardware API')
    .setDescription('API para diagnóstico, simulación y recomendación de hardware de PC')
    .setVersion('1.0.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.BACKEND_PORT || process.env.PORT || 3000);
  console.log(`🚀 API running on: http://localhost:${process.env.BACKEND_PORT || process.env.PORT || 3000}/api`);
  console.log(`📚 Swagger docs: http://localhost:${process.env.BACKEND_PORT || process.env.PORT || 3000}/api/docs`);
}
bootstrap();
