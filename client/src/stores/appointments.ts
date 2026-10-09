import { localData } from "~/app/localData";
import { demoAppointments } from "~/data/appointments/demo";
import { httpAppointments } from "~/data/appointments/http";
import { appointmentsKind } from "~/localData/appointments";

export const useAppointmentsStore = localData.define(
  appointmentsKind({ live: httpAppointments, demo: demoAppointments() }),
);
