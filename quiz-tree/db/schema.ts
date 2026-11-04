import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const classrooms=sqliteTable('classrooms',{id:text('id').primaryKey(),owner:text('owner').notNull(),data:text('data').notNull(),revision:integer('revision').notNull().default(0)});
export const roomPins=sqliteTable('room_pins',{pin:text('pin').primaryKey(),room:text('room').notNull().unique()});
