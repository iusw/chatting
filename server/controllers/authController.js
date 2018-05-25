//controllers/authController.js
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const dayjs = require('dayjs')
const crypto = require('crypto')
const crypto_config = require('../config/config').crypto_config;
const MAIL = require('../config/config').MAIL;
const APP = require('../config/config').APP;
const User = require('../models/User')
const Auth = require('../models/Auth')


async function login(ctx,next){

  const data = ctx.request.body

  const userInfo = await User.findUserByEmail(data.email)

  if(userInfo){

    if(!compareSync(data.password,userInfo.password)){
      ctx.body = {
        errorCode: 2005,
        message: '密码错误！'
      }
    }else{
      const secret = crypto.createHmac('sha256', crypto_config.salt)
        .update(crypto_config.update)
        .digest('hex')

      const token = jwt.sign({
        name: userInfo.nickname,
        id: userInfo.id
      }, secret)
      ctx.body = {
        errorCode: 2000,
        message: '登录成功',
        user: {
          id: userInfo.id,
          nickname: userInfo.nickname,
          email:userInfo.email,
          avatar:userInfo.avatar,
          description:userInfo.description,
          created_at:userInfo.created_at,
          updated_at:userInfo.updated_at,
        },
        token: token,
      }
    }
  }else{
    ctx.body = {
      errorCode: 2004,
      message: '用户不存在！'
    }
  }
  return next()
}
async function register(ctx,next) {
  const data = ctx.request.body
  const userInfo = await User.findUserByEmail(data.email)
  if(userInfo){
    ctx.body = {
      errorCode: 2007,
      message: '该邮箱已被注册！如果忘记密码可点击下方重置密码'
    }
  }else{
    const user = await User.createUser(data.nickname,data.email,data.password)
    if(user){
      const secret = crypto.createHmac('sha256', crypto_config.salt)
        .update(crypto_config.update)
        .digest('hex')
      const token = jwt.sign({
        name: user.dataValues.nickname,
        id: user.dataValues.id
      }, secret)
      ctx.body = {
        errorCode: 2000,
        message: '注册成功',
        user: {
          id: user.dataValues.id,
          nickname: user.dataValues.nickname,
          email:user.dataValues.email,
          avatar:user.dataValues.avatar,
          description:user.dataValues.description,
          created_at:user.dataValues.created_at,
          updated_at:user.dataValues.updated_at,
        },
        token: token,
      }
    }else{
      ctx.body = {
        errorCode: 2009,
        message: '抱歉，系统故障,账号创建失败'
      }
    }
  }
}

async function sendResetMail(ctx,next) {
  const data = ctx.request.body
  const userInfo = await User.findUserByEmail(data.email)
  if(userInfo){
    const secret = crypto.createHmac('sha256', 'password reset email link active code')
      .update(Date.now().toString())
      .digest('hex')
    let url = APP.HOST+'/#/resetpass?active='+secret
    let transporter = nodemailer.createTransport({
      host: MAIL.HOST,
      port: MAIL.PORT,
      secure: MAIL.SSL, // true for 465, false for other ports
      auth: {
        user: MAIL.ACCOUNT, // generated ethereal user
        pass: MAIL.PASSWORD // generated ethereal password
      }
    });

    // setup email data with unicode symbols
    let mailOptions = {
      from: '"Fred Foo 👻" <liut0078@163.com>', // sender address
      to: userInfo.email, // list of receivers
      subject: '[Chatting]找回您的账户密码', // Subject line
      html: '<p>尊敬的Chatting用户，您好！</p>' +
      '<p style="margin-top: 30px">您在访问Chatting时点击了“忘记密码”链接，这是一封密码重置确认邮件。</p>' +
      '<p style="margin-top: 20px">您可以通过点击以下链接重置帐户密码:</p><a href="'+url+'"><p>' +url+'</p></a>' +
      '<p style="margin-top: 20px">为保障您的帐号安全，请在30分钟内点击该链接，您也可以将链接复制到浏览器地址栏访问。 若如果您并未尝试修改密码，请忽略本邮件，由此给您带来的不便请谅解。</p>' +
      '<p style="margin-top: 20px">本邮件由系统自动发出，请勿直接回复！</p>' // html body
    };
    // send mail with defined transport object
    let re = await transporter.sendMail(mailOptions).then(function(info){
      // console.log(info);
      let re = Auth.setPassResetRecord(userInfo.email,secret)
      if(!re){
        return {
          errorCode: 2015,
          message: '密码重置邮件发送失败~请稍后再试'
        }
      }else{
        return {
          errorCode: 2000,
          message: '密码重置邮件发送成功~请前往邮箱查收！（垃圾箱也别放过喔~）'
        }
      }

    }).catch(function(err){
      console.log(err);
      return {
        errorCode: 2014,
        message: '密码重置邮件发送失败~请稍后再试'
      }
    });

    ctx.body = re

  }else{
    ctx.body = {
      errorCode: 2004,
      message: '用户不存在!'
    }
  }
  return next()
}

async function showResetPassPage(ctx,next){
  let code = ctx.params.code
  let res = await Auth.validatePassResetCode(code)
  if(res.length > 0){
    if(dayjs(res[0].created_at).add(8,'hour').add(15,'minute').valueOf()>Date.now()){
      ctx.body = {
        errorCode: 2020,
        message: '邮件验证通过!',
        email: res[0].email
      }
    }else{
      ctx.body = {
        errorCode: 2025,
        message: '邮件已过期或不存在!'
      }
    }
  }else{
    ctx.body = {
      errorCode: 2024,
      message: '邮件已过期或不存在!'
    }
  }
  return next()
}

async function ResetPass(ctx,next) {
  const data = ctx.request.body
  if(data.code && data.code !== ""){
    if(data.password === data.password_confirm){
      let res = await Auth.validatePassResetCode(data.code)
      if(res.length > 0){
        if(res[0].email === data.email){
          let u = await User.updatePassword(data.email,data.password)
          if(u[0] === 1){
            await Auth.deletePassResetCode(data.email)
            ctx.body = {
              errorCode: 2020,
              message: '密码修改成功!'
            }
          }else{
            ctx.body = {
              errorCode: 2021,
              message: '密码修改失败!请稍后重试发送密码重置邮件'
            }
          }

        }else{
          ctx.body = {
            errorCode: 2029,
            message: '邮件不正确!'
          }
        }
      }else{
        ctx.body = {
          errorCode: 2024,
          message: '邮件已过期或不存在!'
        }
      }
    }else{
      ctx.body = {
        errorCode: 2027,
        message: '两次密码输入不正确!'
      }
    }

  }else{
    ctx.body = {
      errorCode: 2021,
      message: '非法请求!'
    }
  }
  return next()
}

function compareSync(salt,secret){
  let a = crypto.createHmac('sha256', salt)
    .update(crypto_config.update)
    .digest('hex')
  return a === secret
}
module.exports = {
  login,
  register,
  sendResetMail,
  showResetPassPage,
  ResetPass
}
