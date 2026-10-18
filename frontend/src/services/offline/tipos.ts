/** La foto guardada para enviar después ya no está en el teléfono (se borró el almacenamiento
 *  de la app o el navegador limpió sus datos). */
export class FotoNoDisponible extends Error {
  constructor() {
    super('La foto ya no está guardada en este dispositivo.');
  }
}
