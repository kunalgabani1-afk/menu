import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import contactRouter from "./contact";
import platformRouter from "./platform";
import restaurantRouter from "./restaurant";
import publicRouter from "./public";
import ordersRouter from "./orders";
import shiftsRouter from "./shifts";
import captainRouter from "./captain";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(contactRouter);
router.use(platformRouter);
router.use(restaurantRouter);
router.use(publicRouter);
router.use(ordersRouter);
router.use(shiftsRouter);
router.use(captainRouter);

export default router;
