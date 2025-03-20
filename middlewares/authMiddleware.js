import { ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node';
import User from '../models/userModel';
import expressAsyncHandler from 'express-async-handler';


//middleware to verify that user is authenticated with clerk
export const protect  = ClerkExpressRequireAuth();

//middleware to check user roles

export const authorize = (...roles)=>{
    return expressAsyncHandler(async(req,res,next)=>{
        //get user from clerk 
        const clerkId = req.auth.userId;

        //find user in the database
        const user = await User.findOne({clerkId});

        if(!user)
        {
            res.status(400);
            throw new error('User not found in the system!');
        }

        //check if the user role is authorised
        if(!roles.includes(user.role))
        {
            res.status(403);
            throw new Error('Not authorised to access this resource');
        }

        //add user to request object
        req.user = user;
        next();
    })
}


//middleware to sync clerk user with our database

export const syncUser = expressAsyncHandler(async(req,res,next)=>{
    const clerkId = req.auth.userId;
    const clerkUser = req.auth;

    let user = await User.findOne({clerkId});
    if(!user)
    {
        user = await User.create({
            clerkId,
            email: clerkUser.email,
            firstName: clerkUser.firstName || '',  
            lastName: clerkUser.lastName || '',
            role: 'patient' // default role
        })
    }

    //update last login
    user.lastLogin = new Date();
    await user.save();
    req.user = user;
    next(); 
})