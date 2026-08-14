"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncHandler = asyncHandler;
function asyncHandler(route) {
    return (req, res, next) => {
        void route(req, res, next).catch(next);
    };
}
